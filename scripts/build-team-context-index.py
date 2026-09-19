"""Build a sourced team index from existing snapshots; no network or model mutation."""
import argparse, hashlib, json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
paths={'personnel':'data/ingestion/team-personnel-2026.json','schedule':'data/calibration/weekly-event-schedule-2026.json','scoring':'data/probability/generated/current-game-scoring-2026.json','quotes':'data/market/current-game-lines-2026.json','picks':'data/market/issued-pick-history-2026.json','results':'data/market/issued-pick-results-2026.json'}
d={};sources={}
for name,path in paths.items():
 raw=(a.source/path).read_bytes();d[name]=json.loads(raw);sources[name]={'path':path,'sha256':hashlib.sha256(raw).hexdigest(),'source_timestamp':next((d[name][k] for k in ('captured_at','generated_at','fetched_at') if k in d[name]),None)}
assert d['personnel']['season']==d['schedule']['season']==d['scoring']['season']==2026
assert d['personnel']['week']==d['schedule']['week']==d['scoring']['week']
teams={};games={};issues=[]
for team,record in d['personnel']['teams'].items():
 assert record['team']==team
 ids=[x['athlete_id'] for x in record['players']];assert len(ids)==len(set(ids)),team
 teams[team]={'team_id':team,'personnel':record,'game_ids':[],'scoring_context':None,'gaps':['division_and_full_season_schedule_not_joined','coaching_and_scheme_not_joined','special_teams_and_detailed_tendencies_not_joined','season_win_total_not_joined','current_sourced_team_writeup_not_joined'],'personnel_numeric_influence':False}
for gid,g in d['schedule']['games'].items():
 assert g['home_team'] in teams and g['away_team'] in teams
 projection=d['scoring']['games'].get(gid)
 if projection:
  assert all(projection[k]==g[k] for k in ('home_team','away_team','event_start'))
  for t in (g['home_team'],g['away_team']):teams[t]['scoring_context']=projection['evidence']['teams'][{'LA':'LAR','WSH':'WAS'}.get(t,t)]
 quotes=[q for q in d['quotes']['games'] if q['id']==gid]
 for q in quotes:assert all(q[k]==g[k] for k in ('home_team','away_team'))
 picks=[r for r in d['picks']['records'] if r['game_id']==gid];pickids={r['record_id'] for r in picks}
 settlements=[r for r in d['results']['settlements'] if r['record_id'] in pickids]
 games[gid]={'schedule':g,'current_projection':projection,'projection_is_original_pregame_archive':False,'market_snapshots':quotes,'issued_records':picks,'settlement_revisions':settlements,'betting_splits':None,'complete_final_boxscore':None}
 for t in (g['home_team'],g['away_team']):teams[t]['game_ids'].append(gid)
 if not quotes:issues.append({'game':gid,'gap':'no_matching_quote'})
assert len(teams)==32
out={'schema_version':1,'season':2026,'week':d['schedule']['week'],'scope':'Saved snapshot index; not live-certified or a complete season archive','sources':sources,'teams':teams,'games':games,'gaps':issues,'model_mutated':False,'automatic_refresh_connected':False}
a.output.mkdir(parents=True,exist_ok=True)
file=a.output/'team-master-2026.json';encoded=json.dumps(out,indent=2)+'\n'
if not file.exists() or file.read_text()!=encoded:file.write_text(encoded)
summary={'teams':len(teams),'games':len(games),'players':sum(len(t['personnel']['players']) for t in teams.values()),'games_with_quotes':sum(bool(g['market_snapshots']) for g in games.values()),'games_with_projection':sum(bool(g['current_projection']) for g in games.values()),'input_fingerprint':hashlib.sha256(json.dumps(sources,sort_keys=True).encode()).hexdigest()}
(a.output/'coverage.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary))
