"""Publish pre-Week-9 football observations; never include current-week results."""
import csv, json, re, hashlib
from pathlib import Path
from datetime import datetime, timezone

root = Path(__file__).resolve().parents[1]
read = lambda p: json.loads((root / p).read_text())
key = lambda s: re.sub(r'[^a-z0-9]', '', re.sub(r'\b(jr|sr|ii|iii|iv)\b', '', s.lower()))
canon = lambda s: {'LAR': 'LA', 'WSH': 'WAS'}.get(s, s)
source = root / '.cache/matchup-context/stats_player_week_2026.csv'
rows = [r for r in csv.DictReader(source.open()) if r['season_type'] == 'REG' and 1 <= int(r['week']) < 9]
distributions = read('data/probability/generated/weekly-probability-distributions-2026.json')
schedule = read('data/calibration/weekly-event-schedule-2026.json')
assert distributions['week'] == schedule['week'] == 9
stat_map = {'passing_yards': 'pass_yards', 'rushing_yards': 'rush_yards', 'receiving_yards': 'receiving_yards'}
players = {}
for game_id, game in schedule['games'].items():
    for name in game.get('players', []):
        prior = distributions['distributions'].get(name)
        if not prior:
            continue
        own = [r for r in rows if key(r['player_display_name']) == key(name) and r['position'] == prior['position']]
        if not own:
            continue
        team = canon(sorted(own, key=lambda r: int(r['week']))[-1]['team'])
        if team not in [game['home_team'], game['away_team']]:
            continue
        opponent = game['away_team'] if team == game['home_team'] else game['home_team']
        stats = {}
        for field, dist_key in stat_map.items():
            spec = prior['distributions'].get(dist_key)
            if not spec or spec['family'] != 'lognormal_shifted':
                continue
            observed = [float(r[field] or 0) for r in own]
            n = len(observed)
            historical = float(spec['mean'])
            average = sum(observed) / n
            # Four historical games stabilize the current-season sample.
            blended = (sum(observed) + 4 * historical) / (n + 4)
            league = [r for r in rows if r['position'] == prior['position']]
            allowed = [r for r in league if canon(r['opponent_team']) == opponent]
            league_games = {(r['opponent_team'], r['game_id']) for r in league}
            opponent_games = {r['game_id'] for r in allowed}
            league_mean = sum(float(r[field] or 0) for r in league) / len(league_games)
            defense_mean = sum(float(r[field] or 0) for r in allowed) / len(opponent_games) if opponent_games else None
            ratio = defense_mean / league_mean if league_mean > 0 and defense_mean is not None else 1
            # Eight league-average games stabilize opponent allowance; cap effect at 15%.
            defense_factor = max(.85, min(1.15, 1 + (ratio - 1) * len(opponent_games) / (len(opponent_games) + 8)))
            mean = blended * defense_factor
            factor = mean / historical if historical > 0 else 1
            adjusted = {**spec, 'mean': mean, 'sd': float(spec['sd']) * factor,
                        'parameters': {**spec['parameters'], 'log_mu': float(spec['parameters']['log_mu']) + __import__('math').log(factor)}}
            stats[field] = {'distribution': adjusted, 'observed_values': observed, 'season_games': n, 'season_average': average,
                            'historical_mean': historical, 'blended_mean': blended, 'projected_mean': mean,
                            'opponent_position_allowed': defense_mean, 'league_position_allowed': league_mean,
                            'defense_games': len(opponent_games), 'defense_factor': defense_factor}
        players[name] = {'position': prior['position'], 'team': team, 'opponent': opponent, 'game_id': game_id,
                         'event_id': game['event_id'], 'kickoff': game['event_start'], 'stats': stats}
output = {'season': 2026, 'week': 9, 'generated_at': datetime.now(timezone.utc).isoformat(),
          'model_version': 'history-defense-props-v1', 'validation_status': 'DEVELOPING_UNVALIDATED',
          'cutoff': 'Completed 2026 regular-season Weeks 1–8 only',
          'method': 'Weeks 1–8 average with four historical-prior games; positional defense allowance shrunk by eight league-average games, capped at ±15%. Final hit probability combines observed Weeks 1–8 hit/push rates at the quoted line with four matchup-distribution observations. DraftKings standard lines only; one player per game. Developing model, not yet validated.',
          'source_url': 'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv',
          'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'players': players}
(root / 'frontend/cloudflare/data/week9-prop-history.json').write_text(json.dumps(output, separators=(',', ':')) + '\n')
print(f'Week 9 history/defense inputs: {len(players)} players, prior weeks 1–8 only')
