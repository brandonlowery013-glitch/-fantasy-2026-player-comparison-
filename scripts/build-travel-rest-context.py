#!/usr/bin/env python3
import csv,io,json,urllib.request,math
from collections import defaultdict
from datetime import datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; SEASONS=[2023,2024,2025,2026]
# Approximate home stadium coordinates and time zones, used only for travel features.
LOC={'ARI':(33.5275,-112.2625,'MST'),'ATL':(33.7554,-84.4010,'EST'),'BAL':(39.2780,-76.6227,'EST'),'BUF':(42.7738,-78.7868,'EST'),'CAR':(35.2258,-80.8528,'EST'),'CHI':(41.8623,-87.6167,'CST'),'CIN':(39.0954,-84.5160,'EST'),'CLE':(41.5061,-81.6995,'EST'),'DAL':(32.7473,-97.0945,'CST'),'DEN':(39.7439,-105.0201,'MST'),'DET':(42.3400,-83.0456,'EST'),'GB':(44.5013,-88.0622,'CST'),'HOU':(29.6847,-95.4107,'CST'),'IND':(39.7601,-86.1639,'EST'),'JAX':(30.3239,-81.6373,'EST'),'KC':(39.0489,-94.4839,'CST'),'LV':(36.0909,-115.1833,'PST'),'LAC':(33.9535,-118.3392,'PST'),'LA':(33.9535,-118.3392,'PST'),'MIA':(25.9580,-80.2389,'EST'),'MIN':(44.9738,-93.2577,'CST'),'NE':(42.0909,-71.2643,'EST'),'NO':(29.9511,-90.0812,'CST'),'NYG':(40.8128,-74.0742,'EST'),'NYJ':(40.8128,-74.0742,'EST'),'PHI':(39.9008,-75.1675,'EST'),'PIT':(40.4468,-80.0158,'EST'),'SEA':(47.5952,-122.3316,'PST'),'SF':(37.4033,-121.9694,'PST'),'TB':(27.9759,-82.5033,'EST'),'TEN':(36.1665,-86.7713,'CST'),'WAS':(38.9076,-76.8645,'EST')}
def dist(a,b):
 R=3958.8; p1,p2=map(math.radians,[a[0],b[0]]); dp=math.radians(b[0]-a[0]); dl=math.radians(b[1]-a[1]); h=math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2; return R*2*math.asin(math.sqrt(h))
def parse(t):
 rows=[]; rr=csv.DictReader(io.StringIO(t))
 for r in rr:
  if (r.get('game_type') or 'REG')!='REG':continue
  try: season=int(r['season']); week=int(r['week'])
  except:continue
  if season not in SEASONS:continue
  rows.append((season,week,r.get('gameday') or r.get('game_date'),r.get('home_team'),r.get('away_team')))
 return rows
allg=[]
for s in SEASONS:
 with urllib.request.urlopen(f'https://github.com/nflverse/nflverse-data/releases/download/schedules/games_{s}.csv') as f:allg+=parse(f.read().decode())
by=defaultdict(list)
for season,week,date,home,away in allg:
 if home not in LOC or away not in LOC:continue
 by[away].append((season,week,date,home,away));by[home].append((season,week,date,home,away))
out={}
for team,games in by.items():
 games.sort(key=lambda x:(x[0],x[1])); prev=None; road=0; rows=[]
 for season,week,date,home,away in games:
  d=None
  try:d=datetime.fromisoformat(date).date()
  except:pass
  rest=(d-prev).days if d and prev else None
  isroad=team==away; road=road+1 if isroad else 0
  travel=dist(LOC[team],LOC[home]) if isroad else 0
  rows.append({'season':season,'week':week,'rest_days':rest,'short_rest':rest is not None and rest<7,'road_game':isroad,'travel_miles':round(travel,1),'consecutive_road_games':road,'thursday_turnaround':False})
  prev=d
 out[team]=rows
result={'schema_version':'travel-rest-context.v1','history_window':SEASONS,'generated_at':datetime.utcnow().isoformat()+'Z','teams':out,'sportsbook_inputs_used':False,'status':'READY_FOR_BACKTEST','notes':['Travel uses approximate stadium coordinates.','No betting authority until grouped out-of-sample testing.']}
p=ROOT/'data/probability/generated/travel-rest-context-2023-2026.json';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(result,indent=2)+'\n');(ROOT/'guardrails/travel-rest-context-report.json').write_text(json.dumps({'result':'READY_FOR_BACKTEST','teams':len(out),'games':len(allg),'sportsbook_inputs_used':False},indent=2)+'\n');print(json.dumps({'result':'READY_FOR_BACKTEST','teams':len(out),'games':len(allg)},indent=2))
