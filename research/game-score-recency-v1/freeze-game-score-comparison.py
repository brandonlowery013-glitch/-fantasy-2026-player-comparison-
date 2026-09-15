"""Write a new pregame research snapshot; never overwrite an existing capture."""
import argparse, datetime, hashlib, importlib.util, json, pathlib

p=argparse.ArgumentParser();p.add_argument('scores');p.add_argument('schedule');p.add_argument('output');a=p.parse_args()
script=pathlib.Path(__file__).with_name('validate-game-score-recency.py')
spec=importlib.util.spec_from_file_location('score_validation',script);model=importlib.util.module_from_spec(spec);spec.loader.exec_module(model)
history=model.load_games(a.scores);schedule=json.loads(pathlib.Path(a.schedule).read_text())
now=datetime.datetime.now(datetime.timezone.utc)
norm=lambda t:{'LAR':'LA','WSH':'WAS','JAC':'JAX'}.get(t,t)
rows=[]
assert schedule.get('health',{}).get('status') in ('LIVE','FALLBACK'), 'No fresh schedule'
for g in schedule['games']:
    start=datetime.datetime.fromisoformat(g['start_at'].replace('Z','+00:00'))
    assert g['state']=='pre' and start>now, 'Cannot freeze predictions after kickoff'
    target={'season':2026,'week':2,'home':norm(g['home']['team']),'away':norm(g['away']['team'])}
    forecasts={}
    for key,rolling in [('baseline_method',False),('recency_v1',True)]:
        home,away=model.predict(history,target,rolling)
        forecasts[key]={'home_points':home,'away_points':away,'total':home+away,'home_margin':home-away}
    rows.append({'event_id':g['event_id'],'season':2026,'week':2,'home':target['home'],'away':target['away'],'kickoff':g['start_at'],'forecasts':forecasts})
assert len(rows)==16 and len({r['event_id'] for r in rows})==16, 'Unexpected Week 2 schedule'
out={'experiment':'game-score-recency-v1','status':'PROSPECTIVE_RESEARCH_ONLY','actionable':False,'production_changed':False,'captured_at':now.isoformat(),'scores_sha256':hashlib.sha256(pathlib.Path(a.scores).read_bytes()).hexdigest(),'model_code_sha256':hashlib.sha256(script.read_bytes()).hexdigest(),'schedule_sha256':hashlib.sha256(pathlib.Path(a.schedule).read_bytes()).hexdigest(),'schedule_source':'Cloudflare /api/live/scoreboard?week=2 (ESPN)','games':rows}
with open(a.output,'x') as f:json.dump(out,f,indent=2);f.write('\n')
print('Frozen',len(rows),'prospective score comparisons; no betting recommendations generated.')
