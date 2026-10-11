"""Attribute current-season influence in the EXISTING recency-v1 research model.
Never modifies production forecasts or claims Bayesian/coach-aware inference.
"""
import argparse, datetime, hashlib, importlib.util, json, pathlib

def run(scores,schedule):
    model_path=pathlib.Path(__file__).with_name('validate-game-score-recency.py')
    spec=importlib.util.spec_from_file_location('recency',model_path)
    model=importlib.util.module_from_spec(spec);spec.loader.exec_module(model)
    history=model.load_games(scores);board=json.loads(pathlib.Path(schedule).read_text())
    norm=lambda t:{'LAR':'LA','WSH':'WAS','JAC':'JAX'}.get(t,t)
    rows=[]
    for game in board['games']:
        target={'season':2026,'week':2,'home':norm(game['home']['team']),'away':norm(game['away']['team'])}
        prior=[g for g in history if g['season']<2026]
        eligible=[g for g in history if (g['season'],g['week'])<(2026,2)]
        baseline=model.predict(prior,target,False)
        before=model.predict(prior,target,True)
        after=model.predict(eligible,target,True)
        # Same-week and future results may never change the forecast.
        poison=eligible+[dict(id='future',season=2026,week=2,home=target['home'],away=target['away'],hs=999,aws=0)]
        assert model.predict(poison,target,True)==after
        contributing=[g for g in eligible if g['season']==2026 and (g['home'] in (target['home'],target['away']) or g['away'] in (target['home'],target['away']))]
        def shape(x):return {'home_points':round(x[0],3),'away_points':round(x[1],3),'total':round(sum(x),3),'home_margin':round(x[0]-x[1],3)}
        rows.append({'event_id':game['event_id'],'home':target['home'],'away':target['away'],'kickoff':game['start_at'],'baseline':shape(baseline),'recency_without_week1':shape(before),'recency_with_week1':shape(after),'week1_total_effect':round(sum(after)-sum(before),3),'team_week1_results':contributing,'context_not_applied':['coach_tendencies','pace','injuries','usage','weather','opponent_adjusted_efficiency']})
    assert len(rows)==16 and len({r['event_id'] for r in rows})==16
    return {'status':'RESEARCH_ONLY_NOT_PROMOTED','method':'existing_game_score_recency_v1','bayesian_update_applied':False,'production_changed':False,'generated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scores_sha256':hashlib.sha256(pathlib.Path(scores).read_bytes()).hexdigest(),'model_sha256':hashlib.sha256(model_path.read_bytes()).hexdigest(),'schedule_sha256':hashlib.sha256(pathlib.Path(schedule).read_bytes()).hexdigest(),'leakage_test':'PASS','attribution_note':'Difference holds the recency method fixed and removes all Week 1 results. Includes league-average/home-field updates as well as team score updates. Not a coaching or causal effect. Retrospective source lacks original availability timestamps.','games':rows}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('scores');p.add_argument('schedule');p.add_argument('output');a=p.parse_args()
    out=run(a.scores,a.schedule)
    with open(a.output,'x') as f:json.dump(out,f,indent=2);f.write('\n')
    print(json.dumps({'games':len(out['games']),'leakage_test':out['leakage_test'],'production_changed':False,'examples':[{k:r[k] for k in ['away','home','week1_total_effect','recency_with_week1']} for r in out['games'] if r['home'] in ('NE','ATL','BUF','CHI')]}))
