"""Grade immutable score forecasts against matching final games; never promote models."""
import argparse, datetime, hashlib, json, math, pathlib, statistics

def instant(value):
    d=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
    if d.tzinfo is None: raise ValueError('Timestamp must include timezone')
    return d

def number(value):
    return type(value) in (int,float) and math.isfinite(value)

def norm(team):
    return {'LAR':'LA','WSH':'WAS','JAC':'JAX'}.get(team,team)

def grade(capture,scoreboard):
    captured=instant(capture['captured_at'])
    events={}
    for game in scoreboard['games']:
        eid=str(game['event_id'])
        if eid in events: raise ValueError('Duplicate result event ID')
        events[eid]=game
    rows=[];seen=set()
    for frozen in capture['games']:
        eid=str(frozen['event_id'])
        if eid in seen: raise ValueError('Duplicate forecast event ID')
        seen.add(eid)
        if captured>=instant(frozen['kickoff']): raise ValueError('Forecast captured after kickoff')
        row={'event_id':eid,'home':frozen['home'],'away':frozen['away'],'status':'PENDING'}
        actual=events.get(eid)
        if actual is None:
            row['reason']='Result not supplied';rows.append(row);continue
        if any(norm(actual[side]['team'])!=norm(frozen[side]) for side in ('home','away')):
            raise ValueError('Result teams do not match forecast: '+eid)
        if instant(actual['start_at'])!=instant(frozen['kickoff']):
            raise ValueError('Kickoff changed; manual event reconciliation required: '+eid)
        if actual.get('state')!='post':
            row['reason']='Game is not final';rows.append(row);continue
        scores=[actual[side].get('score') for side in ('home','away')]
        if not all(number(v) and v>=0 and v==int(v) for v in scores):
            raise ValueError('Invalid final scores: '+eid)
        row.update(status='FINAL',actual_home=scores[0],actual_away=scores[1],errors={})
        for model in ('baseline_method','recency_v1'):
            f=frozen['forecasts'][model]
            if not all(number(f.get(k)) for k in ('home_points','away_points','total','home_margin')):
                raise ValueError('Invalid frozen forecast: '+eid)
            if not math.isclose(f['total'],f['home_points']+f['away_points'],abs_tol=1e-8) or not math.isclose(f['home_margin'],f['home_points']-f['away_points'],abs_tol=1e-8):
                raise ValueError('Inconsistent frozen forecast: '+eid)
            row['errors'][model]={'home':f['home_points']-scores[0],'away':f['away_points']-scores[1],'total':f['total']-sum(scores),'margin':f['home_margin']-(scores[0]-scores[1])}
        rows.append(row)
    final=[r for r in rows if r['status']=='FINAL'];summary={}
    for model in ('baseline_method','recency_v1'):
        errors=[r['errors'][model] for r in final]
        summary[model]=None if not errors else {'games':len(errors),'team_score_mae':statistics.mean(abs(e[k]) for e in errors for k in ('home','away')),'total_mae':statistics.mean(abs(e['total']) for e in errors),'margin_mae':statistics.mean(abs(e['margin']) for e in errors),'total_rmse':math.sqrt(statistics.mean(e['total']**2 for e in errors)),'margin_rmse':math.sqrt(statistics.mean(e['margin']**2 for e in errors)),'total_bias':statistics.mean(e['total'] for e in errors)}
    delta=None if not final else {k:summary['recency_v1'][k]-summary['baseline_method'][k] for k in summary['baseline_method'] if k!='games'}
    return {'experiment':capture['experiment'],'status':'AWAITING_FINALS' if not final else 'PARTIAL_RESULTS' if len(final)<len(rows) else 'SCORED_RESEARCH_ONLY','final_games':len(final),'pending_games':len(rows)-len(final),'summary':summary,'challenger_minus_baseline':delta,'promotion_decision':'HOLD','production_changed':False,'reason':'Score comparison only. Prospective sample, probability calibration and market validation require separate review.','games':rows}

def main():
    p=argparse.ArgumentParser();p.add_argument('capture');p.add_argument('scoreboard');p.add_argument('output');a=p.parse_args()
    c=pathlib.Path(a.capture).read_bytes();s=pathlib.Path(a.scoreboard).read_bytes()
    report=grade(json.loads(c),json.loads(s))
    report.update(capture_sha256=hashlib.sha256(c).hexdigest(),scoreboard_sha256=hashlib.sha256(s).hexdigest(),graded_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
    # Separate reports preserve both the pregame capture and earlier grading revisions.
    with open(a.output,'x') as f:json.dump(report,f,indent=2);f.write('\n')
    print(json.dumps({k:report[k] for k in ('status','final_games','pending_games','promotion_decision')}))

if __name__=='__main__':main()
