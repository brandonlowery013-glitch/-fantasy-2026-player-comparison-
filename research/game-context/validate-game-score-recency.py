"""Reproducible score-only walk-forward experiment. Never writes production feeds."""
import argparse, collections, csv, hashlib, json, math, pathlib, random, statistics

def load_games(path):
    games=[]
    for row in csv.DictReader(open(path)):
        if row['game_type']!='REG' or not row['home_score'] or not row['away_score']: continue
        games.append(dict(id=row['game_id'],season=int(row['season']),week=int(row['week']),home=row['home_team'],away=row['away_team'],hs=float(row['home_score']),aws=float(row['away_score'])))
    assert len({g['id'] for g in games})==len(games), 'Duplicate games'
    assert all(math.isfinite(g['hs']) and math.isfinite(g['aws']) and min(g['hs'],g['aws'])>=0 for g in games)
    return sorted(games,key=lambda g:(g['season'],g['week'],g['id']))

def predict(games,target,rolling=False):
    s,w=target['season'],target['week']
    history=[g for g in games if s-3<=g['season']<s or (rolling and g['season']==s and g['week']<w)]
    assert all((g['season'],g['week'])<(s,w) for g in history)
    league=statistics.mean([v for g in history for v in (g['hs'],g['aws'])])
    hfa=statistics.mean(g['hs']-g['aws'] for g in history)
    def team(t):
        rows=[(g['hs'],g['aws']) if g['home']==t else (g['aws'],g['hs']) for g in history if t in (g['home'],g['away'])]
        if not rows: raise ValueError('Missing team history: '+t)
        weights=[2**(-(len(rows)-1-i)/16) if rolling else 1 for i in range(len(rows))]
        return tuple((sum(pair[k]*weight for pair,weight in zip(rows,weights))+8*league)/(sum(weights)+8) for k in (0,1))
    h,a=team(target['home']),team(target['away'])
    return ((h[0]+a[1])/2+hfa/2,(a[0]+h[1])/2-hfa/2)

def metrics(rows,key):
    total=[sum(r[key])-sum(r['actual']) for r in rows]
    margin=[r[key][0]-r[key][1]-(r['actual'][0]-r['actual'][1]) for r in rows]
    return {'games':len(rows),'team_score_mae':statistics.mean(abs(p-a) for r in rows for p,a in zip(r[key],r['actual'])), 'total_mae':statistics.mean(map(abs,total)), 'margin_mae':statistics.mean(map(abs,margin)), 'total_rmse':math.sqrt(statistics.mean(x*x for x in total)), 'margin_rmse':math.sqrt(statistics.mean(x*x for x in margin)), 'total_bias':statistics.mean(total)}

def bootstrap(rows):
    weeks=collections.defaultdict(list)
    for r in rows:weeks[r['week']].append(abs(sum(r['challenger'])-sum(r['actual']))-abs(sum(r['baseline'])-sum(r['actual'])))
    rng=random.Random(20260915);keys=sorted(weeks);means=[]
    for _ in range(2000):
        values=[x for k in rng.choices(keys,k=len(keys)) for x in weeks[k]]
        means.append(statistics.mean(values))
    means.sort();return [means[49],means[1949]]

def main():
    p=argparse.ArgumentParser();p.add_argument('csv');p.add_argument('output');args=p.parse_args()
    games=load_games(args.csv)
    # Changing outcomes in the evaluated week or future must not alter that week's prediction.
    sample=next(g for g in games if g['season']==2025 and g['week']==5)
    modified=[dict(g,hs=g['hs']+100,aws=g['aws']+100) if (g['season'],g['week'])>=(2025,5) else g for g in games]
    for rolling in (False,True):assert predict(games,sample,rolling)==predict(modified,sample,rolling)
    rows=[]
    for g in games:
        if g['season'] not in (2024,2025):continue
        rows.append({'id':g['id'],'season':g['season'],'week':g['week'],'actual':[g['hs'],g['aws']],'baseline':predict(games,g),'challenger':predict(games,g,True)})
    summaries={}
    for season in (2024,2025):
        rs=[r for r in rows if r['season']==season];b,c=metrics(rs,'baseline'),metrics(rs,'challenger');interval=bootstrap(rs)
        summaries[str(season)]={'baseline':b,'challenger':c,'total_mae_delta_95pct_week_bootstrap':interval,'by_week':{str(w):{'baseline':metrics([r for r in rs if r['week']==w],'baseline'),'challenger':metrics([r for r in rs if r['week']==w],'challenger')} for w in sorted({r['week'] for r in rs})}}
    h=summaries['2025'];b,c=h['baseline'],h['challenger']
    passed=h['total_mae_delta_95pct_week_bootstrap'][1]<0 and all(c[k]<=1.02*b[k] for k in ['team_score_mae','margin_mae','total_rmse','margin_rmse'])
    result={'experiment':'game-score-recency-v1','source_sha256':hashlib.sha256(pathlib.Path(args.csv).read_bytes()).hexdigest(),'leakage_test':'PASS','summary':summaries,'decision':'ELIGIBLE_FOR_PROSPECTIVE_TEST' if passed else 'DO_NOT_PROMOTE','production_changed':False,'predictions':rows}
    pathlib.Path(args.output).write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k not in ('predictions','summary')}));print(json.dumps({s:{k:v for k,v in x.items() if k!='by_week'} for s,x in summaries.items()},indent=2))

if __name__=='__main__':main()
