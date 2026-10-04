import json,html,pathlib
from datetime import datetime
from zoneinfo import ZoneInfo
def stamp(x):
 return datetime.fromisoformat(x.replace("Z","+00:00")).astimezone(ZoneInfo("America/Chicago")).strftime("%b %d, %I:%M %p CT") if x else "Unavailable"
import sys
root=pathlib.Path.cwd()
if len(sys.argv)!=2: raise SystemExit('Usage: python3 scripts/render-all-game-rerun.py OUTPUT_HTML')
r=json.loads((root/'data/market/all-game-model-rerun-2026.json').read_text());old=json.loads((root/'data/market/weekly-game-market-recommendations-2026.json').read_text())
e=html.escape
cards=[]
for id,g in r['games'].items():
 p=g['football_projection'];c=g['current_recommendations'];o=old['games'][id].get('current_recommendations') or {};rows=[]
 for k,label in [('spread','Spread'),('moneyline','Moneyline'),('total','Total')]:
  q=(c or {}).get(k) or {};before=o.get(k) or {};sel=q.get('selection') or ('Wait' if q.get('decision')=='WAIT' else 'No bet');prob=q.get('model_conditional_win_probability');ev=q.get('expected_value')
  reason=f"The model projects {g['away_team']} {p['away_score_mean']:.1f}, {g['home_team']} {p['home_score_mean']:.1f}. "
  if k=='total':reason+=f"That is {p['model_total']:.1f} combined points. "
  if prob is not None:reason+=f"At the saved line, it gives this pick a {prob*100:.1f}% chance of winning, excluding pushes."
  else:reason+='Neither side meets the model’s requirements at the saved price.' if q.get('decision')!='WAIT' else 'The current personnel check puts this pick on hold.'
  evtext=f'{ev*100:+.1f}%' if ev is not None else '—'
  rows.append(f'<section><h3>{label} <strong>{e(sel)}</strong></h3><p>{e(reason)}</p><div class="metrics"><span>Previously: <b>{e(before.get("selection") or ("Wait" if before.get("decision")=="WAIT" else "No bet"))}</b></span><span>Expected return: <b>{evtext}</b></span></div></section>')
 cards.append(f'<article><h2>{e(g["away_team"])} at {e(g["home_team"])}</h2><p class="muted">Kickoff {e(stamp(g["kickoff"]))} · Saved odds: {e((c or {}).get("book","Unavailable"))} · {e(stamp((c or {}).get("captured_at","")))}</p>{"".join(rows)}</article>')
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Week 4 model rerun · Chuck the Duke</title><style>body{margin:0;background:#060d18;color:#edf4ff;font:16px/1.55 system-ui}main{max-width:1080px;margin:auto;padding:28px 22px}a{color:#79baff}h1{font-size:32px;margin-bottom:10px}h2{margin:0;font-size:24px}h3{font-size:15px;color:#a8bad0;display:flex;justify-content:space-between;gap:20px}strong{color:#71e7b1;font-size:19px}article{background:#0b1727;border:1px solid #27435e;border-radius:14px;padding:24px;margin:22px 0}section{border-top:1px solid #27435e;padding:10px 0}.muted,.metrics{color:#a8bad0;font-size:14px}.metrics{display:flex;gap:24px;flex-wrap:wrap}.intro{max-width:850px}p{max-width:80ch}b{color:#e1eafa}</style><main><a href="./">← Back to games</a><h1>Week 4 · Updated model picks</h1><div class="intro"><p>All 16 games recalculated with rest removed from the formula. These use saved football inputs and pregame odds, not live prices. For games already underway or finished, this is a comparison—not a new pregame prediction.</p><p class="muted">Original picks and results remain unchanged. Additional matchup factors have not received new numerical weights. Expected return is the model’s estimated average return per stake, not a promised payout.</p>'''+f'<p class="muted">Recalculated {e(stamp(r["generated_at"]))} · Scoring source {e(stamp(r["source_generated_at"]))}</p></div>'+''.join(cards)+'</main></html>'
pathlib.Path(sys.argv[1]).write_text(page)
