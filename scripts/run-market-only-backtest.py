#!/usr/bin/env python3
import json
from pathlib import Path
from datetime import datetime,timezone
p=Path(__file__).resolve().parents[1]/'data/market/free-historical-market-2023-2025.json'
d=json.loads(p.read_text()); rows=d['games']
def rate(vals): return {'n':len(vals),'wins':sum(vals),'losses':len(vals)-sum(vals),'win_rate':round(sum(vals)/len(vals),4) if vals else None}
sp=[];tot=[];ml=[]
for g in rows:
 hs,as_=g.get('home_score'),g.get('away_score'); line=g.get('spread_line'); total=g.get('total_line');
 if hs is None or as_ is None: continue
 if line is not None:
  margin=hs-as_; x=margin+line
  if x!=0: sp.append(x>0)
 if total is not None:
  x=hs+as_-total
  if x!=0: tot.append(x>0)
 fav=g.get('favorite')
 if fav:
  ml.append((fav==g.get('home_team') and hs>as_) or (fav==g.get('away_team') and as_>hs))
report={'generated_at':datetime.now(timezone.utc).isoformat(),'status':'READY_MARKET_ONLY_BASELINE','history_window':[2023,2024,2025],'sportsbook_source':'nflverse schedules/games.csv','consensus_ticket_share':'UNAVAILABLE','money_share':'UNAVAILABLE','line_movement':'UNAVAILABLE','results':{'spread':rate(sp),'total_over':rate(tot),'favorite_moneyline':rate(ml)},'notes':['Pushes excluded.','This is a descriptive baseline, not a live betting record.','Football-context variants have not yet been applied.']}
out=Path(__file__).resolve().parents[1]/'guardrails/market-only-backtest-report.json';out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
