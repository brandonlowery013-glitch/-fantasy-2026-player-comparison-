import json,pathlib,urllib.request,urllib.parse,datetime,concurrent.futures,hashlib
out=pathlib.Path('../../outputs');pred=json.loads((out/'frozen-prospective-game-market-predictions.json').read_text());capture=json.loads((out/'prospective-game-market-test-inputs.json').read_text());by={(r['game_id'],r['market']):r for r in capture['rows']}
def stamp(s):return datetime.datetime.fromisoformat(s.replace('Z','+00:00')).timestamp()
def collect(r):
 source=by[r['game_id'],r['market']];end=int(stamp(r['quote_at']));url='https://clob.polymarket.com/prices-history?'+urllib.parse.urlencode({'market':source['contract']['token_id'],'startTs':end-3600,'endTs':end,'fidelity':1})
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'ctd-game-market-research/1.0'}),timeout=20) as response:raw=response.read()
  points=[p for p in json.loads(raw).get('history',[]) if isinstance(p.get('p'),(int,float)) and 0<p['p']<1 and end-3600<=p['t']<=end];point=max(points,key=lambda p:p['t']) if points else None
  if point is None:return {'game_id':r['game_id'],'market':r['market'],'status':'NO_PRE_QUOTE_SAMPLE'}
  push=source['game']['model']['tie_probability'] if r['market']=='moneyline' else 0;poly=(point['p']-.5*push)/(1-push);w=r['weights'];now=datetime.datetime.now(datetime.timezone.utc).isoformat()
  if stamp(now)>=stamp(r['kickoff']) or not 0<poly<1:raise ValueError('Invalid control cutoff or probability')
  return {'game_id':r['game_id'],'market':r['market'],'kickoff':r['kickoff'],'home_line':r['home_line'],'frozen_at':now,'book_quote_at':r['quote_at'],'polymarket_sample_at':datetime.datetime.fromtimestamp(point['t'],datetime.timezone.utc).isoformat(),'aligned_polymarket_probability':poly,'aligned_revised_probability':w['football']*r['football_probability']+w['book']*r['sportsbook_probability']+w['poly']*poly,'weights':w,'source_url':url,'source_sha256':hashlib.sha256(raw).hexdigest(),'outcome':None,'status':'FROZEN_RESEARCH_CONTROL'}
 except Exception as e:return {'game_id':r['game_id'],'market':r['market'],'status':'UNAVAILABLE','reason':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:rows=list(pool.map(collect,pred['rows']))
file=out/'time-aligned-prospective-controls.json'
if file.exists():raise RuntimeError('Never overwrite a frozen control')
file.write_text(json.dumps({'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rows':rows,'purpose':'Compare Polymarket samples at the saved sportsbook timestamp with the fresh-order-book candidate. Samples do not establish historical executable depth or trade freshness; timing and quote-type differences remain distinct limitations.','production_numeric_authority':0},indent=2)+'\n');print('Frozen aligned controls',sum(r['status']=='FROZEN_RESEARCH_CONTROL' for r in rows),'of',len(rows))
