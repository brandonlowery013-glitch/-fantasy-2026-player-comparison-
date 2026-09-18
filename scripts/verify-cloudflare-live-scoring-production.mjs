import fs from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';

const SITE = process.env.CTD_PRODUCTION_URL || 'https://frontend-ctd-cloudflare-work.chuck-the-duke-preview.pages.dev/';
const OUT_DIR = process.env.CTD_PROOF_DIR || 'artifacts/live-scoring-production-proof';
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const norm = value => ({ LA: 'LAR', WAS: 'WSH', GNB: 'GB', JAC: 'JAX', KAN: 'KC', LVR: 'LV', NWE: 'NE', NOR: 'NO', SFO: 'SF', TAM: 'TB' }[String(value || '').toUpperCase()] || String(value || '').toUpperCase());

await fs.mkdir(OUT_DIR, { recursive: true });
const proofPath = `${OUT_DIR}/proof.json`;
const screenshotPath = `${OUT_DIR}/page.png`;
const startedAt = new Date().toISOString();
const consoleMessages = [];
const network = [];
let browser;

async function writeProof(proof) {
  await fs.writeFile(proofPath, `${JSON.stringify({ started_at: startedAt, site: SITE, ...proof }, null, 2)}\n`);
}

function nearbyDateKeys() {
  const now = Date.now();
  return [-86400000, 0, 86400000].map(delta => new Date(now + delta).toISOString().slice(0, 10).replaceAll('-', ''));
}

function parseEvent(event) {
  const competition = event?.competitions?.[0];
  const away = competition?.competitors?.find(team => team.homeAway === 'away');
  const home = competition?.competitors?.find(team => team.homeAway === 'home');
  if (!competition || !away || !home) return null;
  return {
    event_id: String(event.id || ''),
    away_team: norm(away.team?.abbreviation),
    home_team: norm(home.team?.abbreviation),
    away_score: Number(away.score),
    home_score: Number(home.score),
    state: event?.status?.type?.state || null,
    completed: event?.status?.type?.completed === true,
    status: event?.status?.type?.shortDetail || event?.status?.type?.detail || '',
    clock: event?.status?.displayClock || null,
    period: event?.status?.period ?? null,
  };
}

async function liveEspnEvents() {
  const events = [];
  for (const date of [...new Set(nearbyDateKeys())]) {
    const response = await fetch(`${ESPN}?dates=${date}&limit=100&_=${Date.now()}`, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`ESPN scoreboard ${response.status} for ${date}`);
    const body = await response.json();
    for (const raw of body.events || []) {
      const event = parseEvent(raw);
      if (event?.state === 'in' && !event.completed) events.push(event);
    }
  }
  return [...new Map(events.map(event => [event.event_id, event])).values()];
}

async function siteGames(page) {
  return page.evaluate(() => {
    if (typeof BET_FEED === 'undefined' || !Array.isArray(BET_FEED?.games)) return null;
    return {
      week: Number(BET_FEED.week),
      season: Number(BET_FEED.season || 2026),
      games: BET_FEED.games.map((game, index) => ({
        index,
        away_team: game.away_team,
        home_team: game.home_team,
        away_score: game.away_score,
        home_score: game.home_score,
        status: game.status,
        completed: game.completed === true,
      })),
    };
  });
}

try {
  const live = await liveEspnEvents();
  if (!live.length) {
    await writeProof({ result: 'NO_LIVE_GAME', basic_pass: false, note: 'No ESPN NFL event was in progress during this scheduled production observation.' });
    console.log('CTD_PRODUCTION_PROOF=NO_LIVE_GAME');
    process.exitCode = 0;
  } else {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.on('console', message => consoleMessages.push({ type: message.type(), text: message.text().slice(0, 1000) }));
    page.on('pageerror', error => consoleMessages.push({ type: 'pageerror', text: String(error?.message || error).slice(0, 1000) }));
    page.on('response', response => {
      if (response.url().includes('/api/live/') || response.url().includes('espn.com/apis/site/')) {
        network.push({ url: response.url(), status: response.status() });
      }
    });

    const navigation = await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (!navigation?.ok()) throw new Error(`Cloudflare page navigation failed (${navigation?.status() ?? 'no response'})`);
    await page.waitForFunction(() => typeof BET_FEED !== 'undefined' && Array.isArray(BET_FEED?.games), null, { timeout: 45000 });

    let matched = null;
    for (let attempt = 0; attempt < 5 && !matched; attempt += 1) {
      const feed = await siteGames(page);
      for (const event of live) {
        const game = feed?.games?.find(candidate => normForPage(candidate.away_team) === event.away_team && normForPage(candidate.home_team) === event.home_team);
        if (game) {
          const scoreMatch = Number(game.away_score) === event.away_score && Number(game.home_score) === event.home_score;
          const statusText = String(game.status || '');
          const statusMatch = statusText.length > 0 && statusText !== 'FINAL' && (statusText === event.status || statusText.includes(event.clock || '__NO_CLOCK__') || /Q[1-4]|[1-4](st|nd|rd|th)|HALF/i.test(statusText));
          if (scoreMatch && statusMatch && game.completed !== true) matched = { feed, game, event, scoreMatch, statusMatch };
        }
      }
      if (!matched) await sleep(10000);
    }

    if (!matched) {
      const feed = await siteGames(page);
      throw new Error(`A real ESPN game is live but the deployed page did not converge to the matching live score/state. Live ESPN: ${JSON.stringify(live)} Site feed: ${JSON.stringify(feed)}`);
    }

    await page.evaluate(index => {
      selectedGameIndex = index;
      renderSelectedGame();
    }, matched.game.index);

    const detail = await page.evaluate(async ({ week, away, home }) => {
      const normalize = value => ({ LA: 'LAR', WAS: 'WSH', GNB: 'GB', JAC: 'JAX', KAN: 'KC', LVR: 'LV', NWE: 'NE', NOR: 'NO', SFO: 'SF', TAM: 'TB' }[String(value || '').toUpperCase()] || String(value || '').toUpperCase());
      const scoreResponse = await fetch(`/api/live/scoreboard?week=${encodeURIComponent(week)}`, { cache: 'no-store' });
      if (!scoreResponse.ok) throw new Error(`Live scoreboard endpoint ${scoreResponse.status}`);
      const scoreBody = await scoreResponse.json();
      const event = (scoreBody.games || []).find(candidate => normalize(candidate?.away?.team) === normalize(away) && normalize(candidate?.home?.team) === normalize(home));
      if (!event?.event_id) throw new Error('Selected live matchup was not mapped to an ESPN provider event id.');
      const gameResponse = await fetch(`/api/live/game?event=${encodeURIComponent(event.event_id)}`, { cache: 'no-store' });
      if (!gameResponse.ok) throw new Error(`Live game endpoint ${gameResponse.status}`);
      return { scoreboard_event: event, body: await gameResponse.json() };
    }, { week: matched.feed.week, away: matched.event.away_team, home: matched.event.home_team });

    const gameDetail = detail?.body?.game;
    if (!gameDetail) throw new Error('Cloudflare live game endpoint did not return a game object.');
    if (norm(gameDetail.away?.team) !== matched.event.away_team || norm(gameDetail.home?.team) !== matched.event.home_team) {
      throw new Error(`Cloudflare provider mapping mismatch: ${gameDetail.away?.team}@${gameDetail.home?.team} vs ${matched.event.away_team}@${matched.event.home_team}`);
    }
    if (String(gameDetail.event_id) !== String(matched.event.event_id) || String(gameDetail.provider_event_id) !== String(matched.event.event_id)) {
      throw new Error('Cloudflare live game detail did not preserve the ESPN provider event id.');
    }
    if (gameDetail.state !== 'in' || gameDetail.completed === true) throw new Error(`Cloudflare game detail is not live (state=${gameDetail.state}, completed=${gameDetail.completed}).`);
    if (!gameDetail.clock || !gameDetail.status) throw new Error('Cloudflare game detail did not expose live game clock/state.');

    const validPlayers = (gameDetail.player_stats || []).filter(player => {
      const team = norm(player.team);
      const category = String(player.category || '');
      const hasValue = Object.values(player.stats || {}).some(value => value !== null && value !== '' && value !== '--');
      return (team === matched.event.away_team || team === matched.event.home_team) && ['passing', 'rushing', 'receiving', 'defensive'].includes(category) && player.player_id && player.player && hasValue;
    });
    if (!validPlayers.length) throw new Error('The live ESPN game detail contained no mappable player statistics yet.');

    let renderedPlayer = null;
    for (let attempt = 0; attempt < 5 && !renderedPlayer; attempt += 1) {
      const rendered = await page.locator('.ctdDetailPlayer').allTextContents();
      renderedPlayer = validPlayers.find(player => rendered.some(text => text.includes(player.player)));
      if (!renderedPlayer) await sleep(5000);
    }
    if (!renderedPlayer) throw new Error('Mapped ESPN player statistics reached the production endpoint but were not rendered on the deployed page.');

    const dom = await page.evaluate(() => ({
      selected_index: selectedGameIndex,
      detail_players: [...document.querySelectorAll('.ctdDetailPlayer')].map(node => node.textContent.trim()).filter(Boolean).slice(0, 12),
      detail_text: document.querySelector('#ctdGameTabContent')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 4000) || '',
    }));
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const proof = {
      result: 'BASIC_PASS',
      basic_pass: true,
      observed_at: new Date().toISOString(),
      espn: matched.event,
      site_feed: matched.game,
      site_week: matched.feed.week,
      cloudflare_game: {
        event_id: gameDetail.event_id,
        provider_event_id: gameDetail.provider_event_id,
        away: gameDetail.away,
        home: gameDetail.home,
        away_score: gameDetail.away_score,
        home_score: gameDetail.home_score,
        state: gameDetail.state,
        clock: gameDetail.clock,
        period: gameDetail.period,
        status: gameDetail.status,
        health: detail?.body?.health,
      },
      rendered_player: renderedPlayer,
      rendered_player_count: validPlayers.length,
      dom,
      network: network.slice(-40),
      browser_console: consoleMessages.slice(-40),
    };
    await writeProof(proof);
    console.log(`CTD_PRODUCTION_PROOF=BASIC_PASS event=${matched.event.event_id} matchup=${matched.event.away_team}@${matched.event.home_team} clock=${gameDetail.clock} player=${renderedPlayer.player}`);
  }
} catch (error) {
  await writeProof({
    result: 'LIVE_GAME_PROOF_FAILURE',
    basic_pass: false,
    observed_at: new Date().toISOString(),
    error: String(error?.stack || error),
    network: network.slice(-40),
    browser_console: consoleMessages.slice(-40),
  });
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}

// This helper is stringified into browser-independent matching above by keeping page values simple.
function normForPage(value) {
  return norm(value);
}
