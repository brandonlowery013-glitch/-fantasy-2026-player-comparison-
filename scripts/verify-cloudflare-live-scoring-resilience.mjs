import fs from 'node:fs/promises';
import process from 'node:process';
import crypto from 'node:crypto';

const SITE = String(process.env.CTD_PRODUCTION_URL || 'https://frontend-ctd-cloudflare-work.chuck-the-duke-preview.pages.dev/').replace(/\/$/, '');
const OUT_DIR = process.env.CTD_RESILIENCE_DIR || 'artifacts/live-scoring-resilience-proof';
const PREVIOUS_PROOF = process.env.CTD_PREVIOUS_PROOF || 'artifacts/live-scoring-resilience-state/proof.json';
const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const ESPN_SUMMARY = id => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(id)}`;
const MAX_GAME_AGE_MS = 8 * 24 * 60 * 60 * 1000;
const FRESH_MS = 2 * 60 * 1000;
const normTeam = value => ({ LA: 'LAR', WAS: 'WSH', GNB: 'GB', JAC: 'JAX', KAN: 'KC', LVR: 'LV', NWE: 'NE', NOR: 'NO', SFO: 'SF', TAM: 'TB' }[String(value || '').toUpperCase()] || String(value || '').toUpperCase());

await fs.mkdir(OUT_DIR, { recursive: true });
const proofPath = `${OUT_DIR}/proof.json`;
const startedAt = new Date().toISOString();

async function writeProof(proof) {
  await fs.writeFile(proofPath, `${JSON.stringify({ started_at: startedAt, site: SITE, ...proof }, null, 2)}\n`);
}

function dateKeys(days = 8) {
  const now = Date.now();
  return Array.from({ length: days }, (_, index) => new Date(now - index * 86400000).toISOString().slice(0, 10).replaceAll('-', ''));
}

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return { body: await response.json(), response };
}

function parseScoreEvent(event, weekFallback = null) {
  const competition = event?.competitions?.[0] || {};
  const competitors = competition?.competitors || [];
  const away = competitors.find(item => item.homeAway === 'away') || {};
  const home = competitors.find(item => item.homeAway === 'home') || {};
  const state = event?.status?.type?.state || competition?.status?.type?.state || null;
  return {
    event_id: String(event?.id || ''),
    week: Number(event?.week?.number || weekFallback || 0) || null,
    start: event?.date || competition?.date || null,
    away_team: normTeam(away?.team?.abbreviation || away?.team?.shortDisplayName || away?.team?.displayName),
    home_team: normTeam(home?.team?.abbreviation || home?.team?.shortDisplayName || home?.team?.displayName),
    away_score: away?.score == null ? null : Number(away.score),
    home_score: home?.score == null ? null : Number(home.score),
    state,
    completed: event?.status?.type?.completed === true || competition?.status?.type?.completed === true || state === 'post',
    status: event?.status?.type?.shortDetail || event?.status?.type?.detail || competition?.status?.type?.shortDetail || competition?.status?.type?.detail || '',
  };
}

async function completedEspnEvents() {
  const events = [];
  for (const date of dateKeys()) {
    const { body } = await getJson(`${ESPN_SCOREBOARD}?dates=${date}&limit=100&_=${Date.now()}`);
    const week = body?.week?.number || null;
    for (const raw of body?.events || []) {
      const event = parseScoreEvent(raw, week);
      if (!event.event_id || !event.completed || !event.start) continue;
      const age = Date.now() - Date.parse(event.start);
      if (Number.isFinite(age) && age >= 0 && age <= MAX_GAME_AGE_MS) events.push(event);
    }
  }
  const unique = [...new Map(events.map(event => [event.event_id, event])).values()];
  unique.sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  return unique;
}

function categoryName(group) {
  const source = String(group?.name || group?.displayName || '');
  const raw = source
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
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

function normalizeEspnSummary(summary, eventId) {
  const competition = summary?.header?.competitions?.[0] || {};
  const competitors = competition?.competitors || [];
  const away = competitors.find(item => item.homeAway === 'away') || {};
  const home = competitors.find(item => item.homeAway === 'home') || {};
  const rows = [];
  for (const block of summary?.boxscore?.players || []) {
    const team = normTeam(block?.team?.abbreviation || block?.team?.shortDisplayName || block?.team?.displayName);
    for (const group of block?.statistics || []) {
      const labels = group?.labels || [];
      const category = categoryName(group);
      for (const athlete of group?.athletes || []) {
        rows.push({
          team,
          category,
          player_id: athlete?.athlete?.id ? String(athlete.athlete.id) : null,
          player: athlete?.athlete?.displayName || athlete?.athlete?.shortName || 'Player',
          stats: Object.fromEntries(labels.map((label, index) => [label, athlete?.stats?.[index] ?? null])),
        });
      }
    }
  }
  const state = competition?.status?.type?.state || null;
  return {
    event_id: String(eventId),
    away_team: normTeam(away?.team?.abbreviation || away?.team?.shortDisplayName || away?.team?.displayName),
    home_team: normTeam(home?.team?.abbreviation || home?.team?.shortDisplayName || home?.team?.displayName),
    away_score: away?.score == null ? null : Number(away.score),
    home_score: home?.score == null ? null : Number(home.score),
    state,
    completed: competition?.status?.type?.completed === true || state === 'post',
    players: canonicalPlayers(rows),
  };
}

function canonicalPlayers(rows) {
  return (rows || [])
    .filter(row => row?.player_id && row?.category)
    .map(row => ({
      team: normTeam(row.team),
      category: categoryName({ name: row.category }),
      player_id: String(row.player_id),
      player: String(row.player || ''),
      stats: Object.fromEntries(Object.entries(row.stats || {}).sort(([a], [b]) => a.localeCompare(b))),
    }))
    .sort((a, b) => `${a.player_id}|${a.category}`.localeCompare(`${b.player_id}|${b.category}`));
}

function fingerprint(snapshot) {
  return crypto.createHash('sha256').update(JSON.stringify({
    event_id: snapshot.event_id,
    away_team: snapshot.away_team,
    home_team: snapshot.home_team,
    away_score: snapshot.away_score,
    home_score: snapshot.home_score,
    completed: snapshot.completed,
    players: snapshot.players,
  })).digest('hex');
}

function firstPlayerDiff(expected, actual) {
  const length = Math.max(expected.length, actual.length);
  for (let index = 0; index < length; index += 1) {
    const left = expected[index] || null;
    const right = actual[index] || null;
    if (JSON.stringify(left) !== JSON.stringify(right)) return { index, espn: left, cloudflare: right };
  }
  return null;
}

function cloudflareSnapshot(game) {
  return {
    event_id: String(game?.event_id || ''),
    away_team: normTeam(game?.away?.team),
    home_team: normTeam(game?.home?.team),
    away_score: game?.away_score == null ? Number(game?.away?.score) : Number(game.away_score),
    home_score: game?.home_score == null ? Number(game?.home?.score) : Number(game.home_score),
    state: game?.state || null,
    completed: game?.completed === true || game?.state === 'post',
    players: canonicalPlayers(game?.player_stats || []),
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isFresh(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) && Math.abs(Date.now() - time) <= FRESH_MS;
}

function healthyCloudflareProvider(health) {
  return ['LIVE', 'FALLBACK'].includes(String(health?.status || '').toUpperCase())
    && ['espn-cdn', 'espn-site-api'].includes(String(health?.provider || '').toLowerCase());
}

async function previousProof() {
  try {
    return JSON.parse(await fs.readFile(PREVIOUS_PROOF, 'utf8'));
  } catch {
    return null;
  }
}

try {
  const previous = await previousProof();
  const completedEvents = await completedEspnEvents();
  const recent = (previous?.event_id && completedEvents.find(event => event.event_id === String(previous.event_id))) || completedEvents[0] || null;
  if (!recent) {
    await writeProof({ result: 'NO_RECENT_FINAL', complete_resilience_pass: false, note: 'No completed NFL event from the last eight days was available for resilience validation.' });
    console.log('CTD_RESILIENCE_PROOF=NO_RECENT_FINAL');
    process.exitCode = 0;
  } else {
    const directSummaryResult = await getJson(ESPN_SUMMARY(recent.event_id));
    const espn = normalizeEspnSummary(directSummaryResult.body, recent.event_id);
    assert(espn.completed, `ESPN event ${recent.event_id} is not final.`);
    assert(espn.players.length > 0, `ESPN final ${recent.event_id} has no player-stat rows.`);

    const scoreboardUrl = `${SITE}/api/live/scoreboard${recent.week ? `?week=${encodeURIComponent(recent.week)}` : ''}`;
    const scoreboardResult = await getJson(scoreboardUrl);
    const scoreboard = scoreboardResult.body;
    assert(healthyCloudflareProvider(scoreboard?.health), `Cloudflare scoreboard health is ${scoreboard?.health?.status || 'missing'} / ${scoreboard?.health?.provider || 'missing'}.`);
    assert(isFresh(scoreboard?.generated_at), `Cloudflare scoreboard generated_at is stale or missing: ${scoreboard?.generated_at || 'missing'}.`);
    assert(/no-store/i.test(scoreboardResult.response.headers.get('cache-control') || ''), 'Cloudflare scoreboard response is missing cache-control no-store.');

    const mapped = (scoreboard?.games || []).find(game => String(game?.event_id || game?.provider_event_id || '') === recent.event_id)
      || (scoreboard?.games || []).find(game => normTeam(game?.away?.team) === recent.away_team && normTeam(game?.home?.team) === recent.home_team);
    assert(mapped, `Cloudflare scoreboard did not contain recent ESPN final ${recent.event_id} ${recent.away_team}@${recent.home_team}.`);
    assert(String(mapped.event_id) === recent.event_id && String(mapped.provider_event_id) === recent.event_id, 'Cloudflare scoreboard did not preserve the ESPN event id across both id fields.');
    assert(mapped.completed === true || mapped.state === 'post', `Cloudflare scoreboard did not reconcile final state (state=${mapped.state}, completed=${mapped.completed}).`);
    assert(Number(mapped.away?.score) === espn.away_score && Number(mapped.home?.score) === espn.home_score, `Cloudflare scoreboard final score does not match ESPN (${mapped.away?.score}-${mapped.home?.score} vs ${espn.away_score}-${espn.home_score}).`);

    const detailResult = await getJson(`${SITE}/api/live/game?event=${encodeURIComponent(recent.event_id)}`);
    const detail = detailResult.body;
    assert(healthyCloudflareProvider(detail?.health), `Cloudflare game-detail health is ${detail?.health?.status || 'missing'} / ${detail?.health?.provider || 'missing'}.`);
    assert(isFresh(detail?.generated_at), `Cloudflare game-detail generated_at is stale or missing: ${detail?.generated_at || 'missing'}.`);
    assert(/no-store/i.test(detailResult.response.headers.get('cache-control') || ''), 'Cloudflare game-detail response is missing cache-control no-store.');

    const cloudflare = cloudflareSnapshot(detail?.game);
    assert(cloudflare.event_id === recent.event_id && String(detail?.game?.provider_event_id) === recent.event_id, 'Cloudflare game detail did not preserve the ESPN event id.');
    assert(cloudflare.completed && cloudflare.state === 'post', `Cloudflare game detail did not reconcile ESPN final state (state=${cloudflare.state}, completed=${cloudflare.completed}).`);
    assert(cloudflare.away_team === espn.away_team && cloudflare.home_team === espn.home_team, 'Cloudflare final matchup mapping does not match ESPN.');
    assert(cloudflare.away_score === espn.away_score && cloudflare.home_score === espn.home_score, `Cloudflare final score does not match ESPN (${cloudflare.away_score}-${cloudflare.home_score} vs ${espn.away_score}-${espn.home_score}).`);
    assert(cloudflare.players.length === espn.players.length, `Cloudflare final player-stat row count differs from ESPN (${cloudflare.players.length} vs ${espn.players.length}).`);

    const espnFingerprint = fingerprint(espn);
    const cloudflareFingerprint = fingerprint(cloudflare);
    if (cloudflareFingerprint !== espnFingerprint) {
      const diff = firstPlayerDiff(espn.players, cloudflare.players);
      throw new Error(`Cloudflare final player/stat snapshot differs from the current ESPN provider snapshot. espn=${espnFingerprint} cloudflare=${cloudflareFingerprint} first_diff=${JSON.stringify(diff)}`);
    }

    const espnIds = new Set(espn.players.map(row => row.player_id));
    const cloudflareIds = new Set(cloudflare.players.map(row => row.player_id));
    assert(espnIds.size > 0 && cloudflareIds.size === espnIds.size && [...espnIds].every(id => cloudflareIds.has(id)), 'Cloudflare player provider IDs do not exactly match ESPN player IDs.');

    const sameEventPrevious = previous?.event_id === recent.event_id ? previous : null;
    const idsStableAcrossRuns = sameEventPrevious?.provider_player_ids
      ? sameEventPrevious.provider_player_ids.length === espnIds.size && sameEventPrevious.provider_player_ids.every(id => espnIds.has(String(id)))
      : null;
    if (idsStableAcrossRuns === false) throw new Error('ESPN/Cloudflare provider player IDs changed unexpectedly between resilience observations of the same event.');

    const correctionDetected = Boolean(sameEventPrevious?.espn_fingerprint && sameEventPrevious.espn_fingerprint !== espnFingerprint);
    const correctionValidation = correctionDetected ? 'PASS' : 'WAITING_FOR_PROVIDER_CHANGE';
    const stableIds = idsStableAcrossRuns === null ? 'BASELINE_RECORDED' : 'PASS';

    const proof = {
      result: correctionDetected ? 'RESILIENCE_PASS_WITH_CORRECTION' : 'RESILIENCE_PASS_NO_CORRECTION',
      complete_resilience_pass: correctionDetected && stableIds === 'PASS',
      event_id: recent.event_id,
      matchup: `${espn.away_team}@${espn.home_team}`,
      game_start: recent.start,
      observed_at: new Date().toISOString(),
      checks: {
        feed_freshness_health: 'PASS',
        provider_event_id: 'PASS',
        provider_player_ids: stableIds,
        final_state_reconciliation: 'PASS',
        current_provider_stat_parity: 'PASS',
        later_provider_stat_correction: correctionValidation,
      },
      final_score: { away: espn.away_score, home: espn.home_score },
      provider_player_ids: [...espnIds].sort(),
      espn_fingerprint: espnFingerprint,
      cloudflare_fingerprint: cloudflareFingerprint,
      previous_espn_fingerprint: sameEventPrevious?.espn_fingerprint || null,
      correction_detected: correctionDetected,
      provider_row_count: espn.players.length,
      cloudflare_health: { scoreboard: scoreboard.health, game: detail.health },
    };
    await writeProof(proof);
    console.log(`CTD_RESILIENCE_PROOF=${proof.result} event=${recent.event_id} final=${espn.away_score}-${espn.home_score} ids=${stableIds} correction=${correctionValidation}`);
  }
} catch (error) {
  await writeProof({
    result: 'RESILIENCE_FAILURE',
    complete_resilience_pass: false,
    observed_at: new Date().toISOString(),
    error: String(error?.stack || error),
  });
  console.error(error);
  process.exitCode = 1;
}
