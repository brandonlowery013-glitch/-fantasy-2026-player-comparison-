"""Freeze research predictions before kickoff. No production pick writes."""
import concurrent.futures,datetime,json,pathlib,re,subprocess,urllib.request,hashlib
ROOT=pathlib.Path.cwd();OUT=ROOT/'../../outputs';protocol=json.loads((OUT/'revised-moneyline-spread-test.json').read_text());fixed=protocol['results']
ref=subprocess.check_output(['git','rev-parse','origin/main'],text=True).strip()
def original(path):return json.loads(subprocess.check_output(['git','show',ref+':'+path],text=True))
def get(url):
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'ctd-game-market-research/1.0'}),timeout=25) as r:raw=r.read()
 return json.loads(raw),hashlib.sha256(raw).hexdigest()
def ts(value):
 s=value.replace('Z','+00:00').replace(' ','T');s=s+':00' if s.endswith('+00') else s;s=re.sub(r'\.(\d+)(?=[+-])',lambda m:'.'+m.group(1)[:6].ljust(6,'0'),s)
 return datetime.datetime.fromisoformat(s).timestamp()
def alias(t):return {'LAR':'LA','WSH':'WAS'}.get(t.upper(),t.upper())
NAMES=dict(zip(['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LV','LAC','LA','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WAS'],['Cardinals','Falcons','Ravens','Bills','Panthers','Bears','Bengals','Browns','Cowboys','Broncos','Lions','Packers','Texans','Colts','Jaguars','Chiefs','Raiders','Chargers','Rams','Dolphins','Vikings','Patriots','Saints','Giants','Jets','Eagles','Steelers','49ers','Seahawks','Buccaneers','Titans','Commanders']))
forecasts=original('data/probability/generated/weekly-game-projections-2026.json');quotes=original('data/market/weekly-matchup-market-snapshots-2026.json');recommendations=original('data/market/weekly-game-market-recommendations-2026.json')
events,gamma_hash=get('https://gamma-api.polymarket.com/events?series_id=12185&closed=false&limit=100');contracts={}
for e in events:
 match=re.fullmatch(r'nfl-([a-z]{2,3})-([a-z]{2,3})-\d{4}-\d\d-\d\d',e.get('slug',''))
 if not match:continue
 away,home=map(alias,match.groups())
 for m in e.get('markets',[]):
  if m.get('sportsMarketType') not in ['moneyline','spreads']:continue
  try:kickoff=ts(m.get('gameStartTime') or m['endDate'])
  except (ValueError,KeyError):continue
  contracts.setdefault((away,home,kickoff),{})[m['id']]=m
now=datetime.datetime.now(datetime.timezone.utc).timestamp();requests=[];excluded=[]
for game_id,g in forecasts['games'].items():
 kickoff=ts(g['event_start'])
 if kickoff<=now:continue
 candidates=contracts.get((g['away_team'],g['home_team'],kickoff),{}).values()
 for market in ['moneyline','spread']:
  fields=['home_moneyline','away_moneyline'] if market=='moneyline' else ['home_spread','home_spread_price','away_spread_price']
  valid=[s for s in quotes['games'].get(game_id,{}).get('snapshots',[]) if s['snapshot_kind']!='CLOSE' and all(s.get(k) is not None for k in fields) and 0<=now-ts(s['captured_at'])<=6*3600]
  valid.sort(key=lambda s:(s['book']!='draftkings',-ts(s['captured_at']),s['book']))
  if not valid:excluded.append({'game_id':game_id,'market':market,'reason':'NO_FRESH_SAVED_TWO_SIDED_BOOK_QUOTE'});continue
  s=valid[0];line=None if market=='moneyline' else s['home_spread'];matched=[]
  for m in candidates:
   d=m.get('description','').lower()
   if m.get('resolutionSource')!='https://www.nfl.com/scores' or any(v in d for v in ['first half','first quarter','regulation only']):continue
   outcomes=json.loads(m.get('outcomes','[]'));tokens=json.loads(m.get('clobTokenIds','[]'))
   if len(outcomes)!=2 or len(tokens)!=2 or set(outcomes)!={NAMES[g['home_team']],NAMES[g['away_team']]}:continue
   if market=='moneyline':
    if m.get('sportsMarketType')!='moneyline' or not re.fullmatch(r'nfl-[a-z]{2,3}-[a-z]{2,3}-\d{4}-\d\d-\d\d',m['slug']) or '50-50' not in d or 'tie' not in d:continue
   else:
    q=re.fullmatch(r'Spread:\s*(.+?)\s*\(([+-]?\d+(?:\.\d+)?)\)',m.get('question',''))
    if m.get('sportsMarketType')!='spreads' or float(line).is_integer() or not q:continue
    h=float(q.group(2)) if q.group(1)==NAMES[g['home_team']] else -float(q.group(2)) if q.group(1)==NAMES[g['away_team']] else None
    if h!=line:continue
   matched.append((m,tokens[outcomes.index(NAMES[g['home_team']])]))
  if len(matched)!=1:excluded.append({'game_id':game_id,'market':market,'reason':'NO_UNIQUE_EXACT_EQUIVALENT_CONTRACT'});continue
  m,token=matched[0];requests.append({'game_id':game_id,'market':market,'kickoff':g['event_start'],'game':g,'quote':s,'home_line':line,'contract':{'market_id':m['id'],'condition_id':m['conditionId'],'token_id':token,'question':m['question'],'description':m['description'],'fee_schedule':m.get('feeSchedule')},'existing_market_state':recommendations.get('games',{}).get(game_id,{}).get('current_recommendations',{}).get(market)})
def capture(r):
 try:
  book,digest=get('https://clob.polymarket.com/book?token_id='+r['contract']['token_id']);received=datetime.datetime.now(datetime.timezone.utc).isoformat();stamp=float(book['timestamp'])/1000
  if stamp>ts(received) or ts(received)-stamp>3600 or ts(received)>=ts(r['kickoff']):raise ValueError('Future, stale, or post-kickoff book')
  bids=[float(x['price']) for x in book.get('bids',[])];asks=[float(x['price']) for x in book.get('asks',[])];bid=max(bids) if bids else None;ask=min(asks) if asks else None
  if bid is None or ask is None or not 0<bid<=ask<1:raise ValueError('No valid two-sided order book')
  r['polymarket_book']={'received_at':received,'timestamp':datetime.datetime.fromtimestamp(stamp,datetime.timezone.utc).isoformat(),'best_bid':bid,'best_ask':ask,'midpoint':(bid+ask)/2,'bid_ask_spread':ask-bid,'sha256':digest,'raw_book':book};return r,None
 except Exception as error:return None,{'game_id':r['game_id'],'market':r['market'],'reason':str(error)}
rows=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for r,error in pool.map(capture,requests):
  if r:rows.append(r)
  else:excluded.append(error)
output={'schema_version':1,'captured_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mode':'RESEARCH_ONLY','protocol_sha256':hashlib.sha256((OUT/'revised-moneyline-spread-test.json').read_bytes()).hexdigest(),'source_commit':ref,'gamma_response_sha256':gamma_hash,'rows':rows,'excluded':excluded,'original_picks_changed':False,'production_numeric_authority':0}
file=OUT/'prospective-game-market-test-inputs.json'
if file.exists():raise RuntimeError('Refusing to overwrite a frozen input capture')
file.write_text(json.dumps(output,indent=2)+'\n');print(json.dumps({'captured':len(rows),'excluded':excluded},indent=2))
