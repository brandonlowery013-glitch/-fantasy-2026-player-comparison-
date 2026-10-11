"""Free, read-only historical research. Never changes an issued pick or forecast."""
import concurrent.futures, datetime, hashlib, json, pathlib, re, subprocess, urllib.parse, urllib.request

ROOT = pathlib.Path.cwd()
OUT = ROOT / 'data/research/moneyline-spread-market-information'
OUT.mkdir(parents=True, exist_ok=True)
NOW = datetime.datetime.now(datetime.timezone.utc).isoformat()

def stamp(value):
    normalized = value.replace('Z', '+00:00').replace(' ', 'T')
    if normalized.endswith('+00'): normalized += ':00'
    normalized = re.sub(r'\.(\d+)(?=[+-])', lambda m: '.' + m.group(1)[:6].ljust(6, '0'), normalized)
    return datetime.datetime.fromisoformat(normalized).timestamp()

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'ctd-game-market-research/1.0'}), timeout=30) as response:
        raw = response.read()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()

def git_file(sha, path):
    return json.loads(subprocess.check_output(['git', 'show', sha + ':' + path], text=True))

def save(name, value):
    (OUT / name).write_text(json.dumps(value, separators=(',', ':')) + '\n')

def team(code):
    return {'LAR': 'LA', 'WSH': 'WAS', 'JAC': 'JAX'}.get(code.upper(), code.upper())

NAMES = dict(zip(['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LV','LAC','LA','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WAS'], ['Cardinals','Falcons','Ravens','Bills','Panthers','Bears','Bengals','Browns','Cowboys','Broncos','Lions','Packers','Texans','Colts','Jaguars','Chiefs','Raiders','Chargers','Rams','Dolphins','Vikings','Patriots','Saints','Giants','Jets','Eagles','Steelers','49ers','Seahawks','Buccaneers','Titans','Commanders']))
markets = json.loads((ROOT / 'data/market/weekly-matchup-market-snapshots-2026.json').read_text())
path = 'data/probability/generated/weekly-game-projections-2026.json'
commits = subprocess.check_output(['git', 'log', '--format=%H', '--', path], text=True).splitlines()
forecasts = {}
for sha in reversed(commits):
    data = git_file(sha, path)
    if data.get('week') not in [1,2,3,4] or not data.get('games'):
        continue
    available = subprocess.check_output(['git','show','-s','--format=%cI',sha],text=True).strip()
    for game_id, game in data['games'].items():
        if game_id in forecasts or stamp(available) >= stamp(game['event_start']) or stamp(data['generated_at']) >= stamp(game['event_start']):
            continue
        forecasts[game_id] = {'source_commit':sha,'forecast_available_at':available,'generated_at':data['generated_at'],'game':game,'week':data['week']}

def final_week(week):
    url=f'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&week={week}'
    data, digest=get(url)
    return week,data,{'url':url,'sha256':digest,'retrieved_at':NOW}
finals={}; final_sources=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for week,data,source in pool.map(final_week,[1,2,3,4]):
        final_sources.append(source)
        for event in data.get('events',[]):
            if not event.get('status',{}).get('type',{}).get('completed'):
                continue
            opponents=event['competitions'][0]['competitors']; home=next(t for t in opponents if t['homeAway']=='home'); away=next(t for t in opponents if t['homeAway']=='away')
            key=f"2026-W{week}-{team(away['team']['abbreviation'])}-{team(home['team']['abbreviation'])}"
            finals[key]={'event_id':event['id'],'kickoff':event['date'],'home':int(home['score']),'away':int(away['score']),'source':source}

def gamma_events(params):
    url='https://gamma-api.polymarket.com/events?'+urllib.parse.urlencode(params)
    data,digest=get(url)
    return data,{'url':url,'sha256':digest,'retrieved_at':NOW}
events,source=gamma_events({'series_id':'12185','end_date_min':'2026-09-09T00:00:00Z','end_date_max':'2026-10-09T12:00:00Z','limit':100})
sources=[source]
future,future_source=gamma_events({'series_id':'12185','closed':'false','limit':100});sources.append(future_source);events+=future
by_identity={}
for event in events:
    match=re.fullmatch(r'nfl-([a-z]{2,3})-([a-z]{2,3})-\d{4}-\d\d-\d\d',event.get('slug',''))
    if not match: continue
    away,home=map(team,match.groups())
    for m in event.get('markets',[]):
        if m.get('sportsMarketType') not in ['moneyline','spreads']:continue
        try: kickoff=stamp(m.get('gameStartTime') or m['endDate'])
        except (KeyError,ValueError):continue
        by_identity.setdefault((away,home,kickoff),[]).append(m)

def contract_for(game,market,home_line):
    candidates=by_identity.get((game['away_team'],game['home_team'],stamp(game['event_start'])),[])
    matching=[]
    for m in candidates:
        outcomes=json.loads(m.get('outcomes','[]')); tokens=json.loads(m.get('clobTokenIds','[]'))
        if len(outcomes)!=2 or len(tokens)!=2 or set(outcomes)!={NAMES[game['away_team']],NAMES[game['home_team']]}:continue
        description=m.get('description','').lower()
        source_host=urllib.parse.urlparse(m.get('resolutionSource','')).hostname
        if source_host not in ['www.nfl.com','nfl.com'] or any(t in description for t in ['first half','1st half','first quarter','1st quarter','regulation only']):continue
        if market=='moneyline':
            if m.get('sportsMarketType')!='moneyline' or not re.fullmatch(r'nfl-[a-z]{2,3}-[a-z]{2,3}-\d{4}-\d\d-\d\d', m.get('slug','')) or 'tie' not in description or '50-50' not in description:continue
        else:
            if m.get('sportsMarketType')!='spreads' or home_line is None or float(home_line).is_integer():continue
            subject=re.fullmatch(r'Spread:\s*(.+?)\s*\(([+-]?\d+(?:\.\d+)?)\)',m.get('question',''))
            if not subject:continue
            name,line=subject.group(1),float(subject.group(2)); normalized=line if name==NAMES[game['home_team']] else -line if name==NAMES[game['away_team']] else None
            if normalized!=home_line:continue
        matching.append({'market_id':m['id'],'condition_id':m['conditionId'],'token_id':tokens[outcomes.index(NAMES[game['home_team']])],'slug':m['slug'],'question':m['question'],'description':m.get('description'),'market':market,'home_line':home_line,'home_team':game['home_team'],'away_team':game['away_team'],'kickoff':game['event_start'],'created_at':m['createdAt'],'retrieved_at':NOW,'metadata_scope':'Current provider contract metadata; not an archived historical order book'})
    unique={}
    for item in matching:
        old=unique.get(item['market_id'])
        if old and any(old[k]!=item[k] for k in ['condition_id','token_id','home_line','kickoff','description']):return None
        unique[item['market_id']]=item
    return next(iter(unique.values())) if len(unique)==1 else None

cached_file=OUT/'polymarket-price-history.json'
cached_histories=json.loads(cached_file.read_text()).get('histories',{}) if cached_file.exists() else {}
requests=[]; exclusions=[]
for game_id,forecast in sorted(forecasts.items()):
    g=forecast['game']; final=finals.get(game_id); ledger=markets['games'].get(game_id)
    if not final or not ledger or stamp(final['kickoff'])!=stamp(g['event_start']):
        exclusions.append({'game_id':game_id,'reason':'MISSING_OR_MISMATCHED_VERIFIED_FINAL_OR_MARKETS'});continue
    eligible=[q for q in ledger['snapshots'] if q['snapshot_kind']!='CLOSE' and stamp(forecast['forecast_available_at'])<=stamp(q['captured_at'])<stamp(g['event_start'])]
    for market in ['moneyline','spread']:
        keys=['home_moneyline','away_moneyline'] if market=='moneyline' else ['home_spread','home_spread_price','away_spread_price']
        quotes=[q for q in eligible if all(q.get(k) is not None for k in keys)]
        quotes.sort(key=lambda q:(q['book']!='draftkings',stamp(q['captured_at']),q['book']))
        if not quotes:exclusions.append({'game_id':game_id,'market':market,'reason':'NO_TWO_SIDED_PREGAME_QUOTE'});continue
        q=quotes[0];line=None if market=='moneyline' else q['home_spread'];contract=contract_for(g,market,line)
        row={'game_id':game_id,'market':market,'week':forecast['week'],'forecast':forecast,'decision_at':q['captured_at'],'kickoff':g['event_start'],'home_line':line,'sportsbook_snapshot':q,'verified_final':final,'polymarket_contract':contract}
        requests.append(row)

def history(row):
    contract=row['polymarket_contract']
    if not contract:return row,None,'NO_EXACT_EQUIVALENT_CONTRACT'
    end=int(stamp(row['decision_at']))
    if stamp(contract['created_at'])>end:return row,None,'CONTRACT_CREATED_AFTER_DECISION'
    url='https://clob.polymarket.com/prices-history?'+urllib.parse.urlencode({'market':contract['token_id'],'startTs':end-86400,'endTs':end,'fidelity':1})
    cached=cached_histories.get(row['game_id']+'|'+row['market'])
    if cached and cached.get('url')==url:return row,cached,None
    try:
        data,digest=get(url)
        points=[p for p in data.get('history',[]) if isinstance(p.get('t'),(int,float)) and isinstance(p.get('p'),(int,float))]
        return row,{'url':url,'sha256':digest,'retrieved_at':NOW,'points':points},None
    except Exception as error:return row,None,str(error)
histories={}; rows=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    for row,history_data,error in pool.map(history,requests):
        key=row['game_id']+'|'+row['market'];histories[key]=history_data;row['historical_price_error']=error;rows.append(row)
save('historical-inputs.json',{'schema_version':1,'mode':'RESEARCH_ONLY','generated_at':NOW,'scope':['moneyline','spread'],'weeks':[1,2,3,4],'rows':rows,'exclusions':exclusions,'provider_sources':sources,'final_sources':final_sources,'production_numeric_authority':0})
save('polymarket-price-history.json',{'schema_version':1,'generated_at':NOW,'histories':histories,'source_kind':'PROVIDER_HISTORICAL_TRADE_PRICE_SERIES','historical_execution_depth_or_fees_available':False})
print(json.dumps({'forecasts':len(forecasts),'rows':len(rows),'history_requests':sum(bool(r['polymarket_contract']) for r in rows),'histories_available':sum(bool(h and h['points']) for h in histories.values()),'exclusions':exclusions,'production_numeric_authority':0},indent=2))
