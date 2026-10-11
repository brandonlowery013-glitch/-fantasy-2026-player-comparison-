import csv,gzip,json,hashlib,collections,pathlib
path=pathlib.Path('data/probability/generated/structured-matchup-context-2026.json');out=json.loads(path.read_text());src=pathlib.Path('.cache/matchup-context/play_by_play_2026.csv.gz')
def number(v):
 try:return float(v) if v not in ('',None,'NA') else None
 except ValueError:return None
def canon(t):return {'LA':'LAR','WAS':'WSH','JAC':'JAX'}.get(t,t)
rows=collections.defaultdict(list)
with gzip.open(src,'rt') as f:
 for r in csv.DictReader(f):
  if r['season_type']!='REG' or int(r['season'])!=out['season'] or not 0<int(r['week'])<out['week']:continue
  team=canon(r['posteam'])
  if team not in out['teams']:continue
  if r['play_type'] not in ('pass','run') or number(r['qb_kneel'])==1 or number(r['qb_spike'])==1:continue
  rows[team].append(r)
for team,g in out['teams'].items():
 rs=rows[team];oe=[number(r['pass_oe']) for r in rs if number(r['pass_oe']) is not None];db=[r for r in rs if number(r['qb_dropback'])==1]
 neutral=[r for r in rs if number(r['score_differential']) is not None and abs(number(r['score_differential']))<=7 and number(r['qtr'])<=3 and number(r['half_seconds_remaining'])>120]
 g['play_context']={'proe_percentage_points':sum(oe)/len(oe) if oe else None,'proe_plays':len(oe),'neutral_pass_share':sum(number(r['qb_dropback'])==1 for r in neutral)/len(neutral) if neutral else None,'neutral_plays':len(neutral),'neutral_definition':'First three quarters, within seven points, outside the final two minutes of each half; kneels/spikes excluded','qb_hit_rate':sum(number(r['qb_hit'])==1 for r in db)/len(db) if db and all(number(r['qb_hit']) is not None for r in db) else None,'dropbacks':len(db),'game_ids':sorted(set(r['game_id'] for r in rs)),'pressure_rate':None,'pressure_note':'QB hits exclude hurries and are not total pressure rate.'}
out['unavailable']=[x for x in out['unavailable'] if x!='PROE'];out['sources'].append({'url':'https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2026.csv.gz','sha256':hashlib.sha256(src.read_bytes()).hexdigest()});path.write_text(json.dumps(out,indent=2)+'\n');print('PROE and neutral pass tendency connected for',sum(g['play_context']['proe_plays']>0 for g in out['teams'].values()),'teams')
# Join observed offensive snaps only when name + team identifies one player.
snap=pathlib.Path('.cache/matchup-context/snap_counts_2026.csv')
normalize=lambda s: ''.join(c for c in s.lower() if c.isalnum())
index=collections.defaultdict(list)
for p in out['players'].values():index[(normalize(p['name']),p['team'])].append(p)
groups=collections.defaultdict(list)
with snap.open() as f:
 for r in csv.DictReader(f):
  if int(r['season'])==out['season'] and r['game_type']=='REG' and 0<int(r['week'])<out['week']:groups[(normalize(r['player']),canon(r['team']))].append(r)
matched=0
for key,rs in groups.items():
 if len(index[key])!=1:continue
 p=index[key][0];rs=[r for r in rs if r['game_id'] in p['game_ids']]
 if len({r['game_id'] for r in rs})!=len(rs):raise ValueError('Duplicate snap game')
 if not rs or any(number(r['offense_pct']) is None or number(r['offense_snaps']) is None for r in rs):continue
 p['observed_snap_games']=len(rs);p['observed_snaps_per_game']=sum(number(r['offense_snaps']) for r in rs)/len(rs);p['observed_mean_snap_share']=sum(number(r['offense_pct']) for r in rs)/len(rs);matched+=1
out['sources'].append({'url':'https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_2026.csv','sha256':hashlib.sha256(snap.read_bytes()).hexdigest()})
out['unavailable']=[x for x in out['unavailable'] if x!='snap_share'];out['notes']+=' Observed snap share is the mean of reported game shares; players without an unambiguous match have no snap estimate.'
path.write_text(json.dumps(out,indent=2)+'\n');print('Observed snaps connected for',matched,'players')
