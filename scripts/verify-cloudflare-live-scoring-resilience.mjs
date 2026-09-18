import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import process from 'node:process';

const SITE = (process.env.CTD_PRODUCTION_URL || 'https://frontend-ctd-cloudflare-work.chuck-the-duke-preview.pages.dev/').replace(/\/$/, '');
const OUT_DIR = process.env.CTD_RESILIENCE_DIR || 'artifacts/live-scoring-resilience';
const STATE_DIR = process.env.CTD_RESILIENCE_STATE_DIR || `${OUT_DIR}/state`;
const STATE_FILE = `${STATE_DIR}/latest.json`;
const PROOF_FILE = `${OUT_DIR}/proof.json`;
const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const ESPN_SUMMARY = id => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(id)}`;

const normTeam = value => ({ LA: 'LAR', WAS: 'WSH', GNB: 'GB', JAC: 'JAX', KAN: 'KC', LVR: 'LV', NWE: 'NE', NOR: 'NO', SFO: 'SF', TAM: 'TB' }[String(value || '').toUpperCase()] || String(value || '').toUpperCase());
const stableJson = value => JSON.stringify(value, Object.keys(value || {}).sort());
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.mkdir(STATE_DIR, { recursive: true });

function dateKeys() {
  return [...new Set([0, -1, -2, -3].map(days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10).replaceAll('-', '')))];
}

function parseEvent(raw, week) {
  const competition = raw?.competitions?.[0];
  const away = competition?.competitors?.find(team => team.homeAway === 'away');
  const home = competition?.competitors?.find(team => team.homeAway === 'home');
  if (!competition || !away || !home) return null;
  return {
    event_id: String(raw.id || ''),
    week: Number(week || 0) || null,
    event_start: raw.date || competition.date || null,
    away_team: normTeam(away.team?.abbreviation),
    home_team: normTeam(home.team?.abbreviation),
    away_score: Number(away.score),
    home_score: Number(home.score),
    state: raw?.status?.type?.state || null,
    completed: raw?.status?.type?.completed === true,
    status: raw?.status?.type?.shortDetail || raw?.status?.type?.detail || '',
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${url} returned ${response.status}: ${JSON.stringify(body)?.slice(0, 500)}`);
  return { response, body };
}

async function latestCompletedEspnEvent() {
  const events = [];
  for (const date of dateKeys()) {
    const { body } = await fetchJson(`${ESPN_SCOREBOARD}?dates=${date}&limit=100&_=${Date.now()}`);
    const week = body?.week?.number;
    for (const raw of body?.events || []) {
      const event = parseEvent(raw, week);
      if (event?.event_id && (event.completed || event.state === 'post')) events.push(event);
    }
  }
  const unique = [...new Map(events.map(event => [event.event_id, event])).values()];
  unique.sort((a, b) => new Date(b.event_start || 0) - new Date(a.event_start || 0));
  return unique[0] || null;
}

function categoryName(group) {
  const raw = String(group?.name || group?.displayName || '').toLowerCase();
  if (raw.includes('pass')) return 'passing';
  if (raw.includes('rush')) return 'rushing';
  if (raw.includes('receiv')) return 'receiving';
  if (raw.includes('defens')) return 'defensive';
  if (raw.includes('kick return')) return 'kickReturns';
  if (raw.includes('punt return')) return 'puntReturns';
  if (raw.includes('kick')) return 'kicking';
  if (raw.includes('punt')) return 'punting';
  return raw.replace(/\s+/g, '_') || 'other';
}

function normalizedPlayerRowsFromEspn(summary) {
  const rows = [];
  for (const block of summary?.boxscore?.players || []) {
    const team = normTeam(block?.team?.abbreviation || block?.team?.shortDisplayName || block?.team?.displayName);
    for (const group of block?.statistics || []) {
      const labels = group?.labels || [];
      const category = categoryName(group);
      for (const athlete of group?.athletes || []) {
        const values = athlete?.stats || [];
        rows.push({
          provider: 'espn',
          team_id: block?.team?.id ? String(block.team.id) : null,
          team,
          category,
          player_id: athlete?.athlete?.id ? String(athlete.athlete.id) : null,
          player: athlete?.athlete?.displayName || athlete?.athlete?.shortName || 'Player',
          stats: Object.fromEntries(labels.map((label, index) => [label, values[index] ?? null])),
        });
      }
    }
  }
  return normalizeRows(rows);
}

function normalizeRows(rows) {
  return (rows || []).map(row => ({
    provider: String(row?.provider || 'espn').toLowerCase(),
    team_id: row?.team_id == null ? null : String(row.team_id),
    team: normTeam(row?.team),
    category: String(row?.category || ''),
    player_id: row?.player_id == null ? null : String(row.player_id),
    player: String(row?.player || ''),
    stats: Object.fromEntries(Object.entries(row?.stats || {}).sort(([a], [b]) => a.localeCompare(b))),
  })).sort((a, b) => `${a.team}|${a.category}|${a.player_id}|${a.player}`.localeCompare(`${b.team}|${b.category}|${b.player_id}|${b.player}`));
}

function noStore(response) {
  return /(?:^|,)\s*no-store\b/i.test(response.headers.get('cache-control') || '');
}

function recentIso(value, toleranceMs = 5 * 60 * 1000) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) && Math.abs(Date.now() - time) <= toleranceMs;
}

async function readPreviousState() {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

async function writeProof(proof) {
  await fs.writeFile(PROOF_FILE, `${JSON.stringify(proof, null, 2)}\n`);
}

const observedAt = new Date().toISOString();
try {
  const event = await latestCompletedEspnEvent();
  if (!event) {
    await writeProof({ result: 'NO_RECENT_FINAL', observed_at: observedAt, final_reconciliation: false, note: 'No completed ESPN NFL game was found in the last four UTC dates.' });
    console.log('CTD_RESILIENCE=NO_RECENT_FINAL');
    process.exitCode = 0;
  } else {
    const scoreboardUrl = `${SITE}/api/live/scoreboard${event.week ? `?week=${encodeURIComponent(event.week)}` : ''}`;
    const scoreboardResult = await fetchJson(scoreboardUrl);
    const productionEvent = (scoreboardResult.body?.games || []).find(game => String(game?.event_id) === event.event_id);
    if (!productionEvent) throw new Error(`Production scoreboard did not contain completed ESPN event ${event.event_id}.`);

    const scoreboardFresh = noStore(scoreboardResult.response) && String(scoreboardResult.body?.health?.status || '').toLowerCase() === 'ok' && recentIso(scoreboardResult.body?.generated_at);
    if (!scoreboardFresh) throw new Error('Production scoreboard freshness/health contract failed.');
    if (String(productionEvent.event_id) !== event.event_id || String(productionEvent.provider_event_id) !== event.event_id) throw new Error('Production scoreboard did not preserve the stable ESPN provider event id.');
    if (Number(productionEvent?.away?.score) !== event.away_score || Number(productionEvent?.home?.score) !== event.home_score || productionEvent.completed !== true || productionEvent.state !== 'post') {
      throw new Error(`Production scoreboard did not reconcile the ESPN final state for ${event.event_id}.`);
    }

    const detailResult = await fetchJson(`${SITE}/api/live/game?event=${encodeURIComponent(event.event_id)}`);
    const game = detailResult.body?.game;
    if (!game) throw new Error('Production game detail did not return a game object.');
    const detailFresh = noStore(detailResult.response) && String(detailResult.body?.health?.status || '').toLowerCase() === 'ok' && recentIso(detailResult.body?.generated_at) && recentIso(detailResult.body?.health?.received_at);
    if (!detailFresh) throw new Error('Production game-detail freshness/health contract failed.');
    if (String(game.event_id) !== event.event_id || String(game.provider_event_id) !== event.event_id) throw new Error('Production game detail did not preserve the stable ESPN provider event id.');
    if (normTeam(game?.away?.team) !== event.away_team || normTeam(game?.home?.team) !== event.home_team) throw new Error('Production game detail mapped the final event to the wrong teams.');
    if (Number(game.away_score) !== event.away_score || Number(game.home_score) !== event.home_score || game.completed !== true || game.state !== 'post') throw new Error('Production game detail did not reconcile the ESPN final score/state.');

    const espnSummary = (await fetchJson(ESPN_SUMMARY(event.event_id))).body;
    const espnRows = normalizedPlayerRowsFromEspn(espnSummary);
    const productionRows = normalizeRows(game.player_stats);
    if (!espnRows.length) throw new Error('ESPN final summary returned no player statistics to validate.');
    const espnPlayerHash = hash(espnRows);
    const productionPlayerHash = hash(productionRows);
    if (espnPlayerHash !== productionPlayerHash) throw new Error('Production final player statistics do not match the current ESPN summary.');

    const previous = await readPreviousState();
    const sameEventPrevious = previous?.event_id === event.event_id ? previous : null;
    const correctionObserved = Boolean(sameEventPrevious && sameEventPrevious.espn_player_hash && sameEventPrevious.espn_player_hash !== espnPlayerHash);
    const correctionReconciled = correctionObserved ? productionPlayerHash === espnPlayerHash : null;

    const state = {
      event_id: event.event_id,
      event_start: event.event_start,
      matchup: `${event.away_team}@${event.home_team}`,
      espn_player_hash: espnPlayerHash,
      production_player_hash: productionPlayerHash,
      final_score: `${event.away_score}-${event.home_score}`,
      observed_at: observedAt,
    };
    await fs.writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);

    const proof = {
      result: 'POSTGAME_RESILIENCE_PASS',
      observed_at: observedAt,
      event,
      feed_freshness_health: true,
      stable_provider_ids: true,
      final_reconciliation: true,
      final_player_stats_match_espn: true,
      player_stat_rows: productionRows.length,
      correction_observed: correctionObserved,
      correction_reconciled: correctionReconciled,
      correction_validation_complete: correctionObserved && correctionReconciled === true,
      prior_snapshot: sameEventPrevious ? {
        observed_at: sameEventPrevious.observed_at,
        espn_player_hash: sameEventPrevious.espn_player_hash,
      } : null,
      current_snapshot: state,
      cache_control: {
        scoreboard: scoreboardResult.response.headers.get('cache-control'),
        game_detail: detailResult.response.headers.get('cache-control'),
      },
    };
    await writeProof(proof);
    console.log(`CTD_RESILIENCE=POSTGAME_RESILIENCE_PASS event=${event.event_id} matchup=${event.away_team}@${event.home_team} correction_observed=${correctionObserved}`);
  }
} catch (error) {
  await writeProof({
    result: 'POSTGAME_RESILIENCE_FAILURE',
    observed_at: observedAt,
    error: String(error?.stack || error),
  });
  console.error(error);
  process.exitCode = 1;
}
