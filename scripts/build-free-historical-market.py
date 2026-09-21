#!/usr/bin/env python3
import csv,io,json,urllib.request
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1]; seasons={2023,2024,2025}
url='https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv'
with urllib.request.urlopen(url) as f: rows=csv.DictReader(io.StringIO(f.read().decode()))
out=[]
for r in rows:
 try: season=int(r.get('season',''))
 except: continue
 if season not in seasons or (r.get('game_type') or 'REG')!='REG': continue
 def num(*ks):
  for k in ks:
   try:
    if r.get(k) not in (None,''): return float(r[k])
   except ValueError: pass
  return None
 spread=num('spread_line','spread'); total=num('total_line','over_under_line','total'); home_ml=num('home_moneyline','home_moneyline_odds'); away_ml=num('away_moneyline','away_moneyline_odds')
 hs=num('home_score');ascore=num('away_score')
 out.append({'game_id':r.get('game_id') or f"{season}_{r.get('week')}_{r.get('away_team')}_{r.get('home_team')}",'season':season,'week':num('week'),'gameday':r.get('gameday'),'away_team':r.get('away_team'),'home_team':r.get('home_team'),'spread_line':spread,'total_line':total,'home_moneyline':home_ml,'away_moneyline':away_ml,'home_score':hs,'away_score':ascore,'favorite':r.get('fav_team') or (r.get('home_team') if spread is not None and spread<0 else r.get('away_team') if spread is not None and spread>0 else None),'consensus_ticket_share':None,'money_share':None,'line_movement':None,'source':'nflverse schedules/games.csv','pregame_timestamp_available':False})
result={'schema_version':'free-historical-market.v1','history_window':[2023,2024,2025],'generated_at':datetime.now(timezone.utc).isoformat(),'games':out,'sportsbook_inputs_used':False,'limitations':['Closing/reference lines are available, but consensus ticket share, money share, and timestamped line movement are not provided by this free source.','Pregame capture timestamps are unavailable.'],'status':'READY_FOR_MARKET_ONLY_BACKTEST'}
p=ROOT/'data/market/free-historical-market-2023-2025.json';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(result,indent=2)+'\n');(ROOT/'guardrails/free-historical-market-report.json').write_text(json.dumps({'result':'READY_FOR_MARKET_ONLY_BACKTEST','games':len(out),'consensus_available':False,'money_share_available':False},indent=2)+'\n');print(json.dumps({'result':'READY_FOR_MARKET_ONLY_BACKTEST','games':len(out),'consensus_available':False,'money_share_available':False},indent=2))
