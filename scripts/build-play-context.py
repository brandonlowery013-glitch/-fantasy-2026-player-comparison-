#!/usr/bin/env python3
import csv,gzip,io,json,urllib.request
from collections import defaultdict
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SEASONS=[2023,2024,2025,2026]
BASE='https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_%s.csv.gz'
agg=defaultdict(lambda: {'games':set(),'plays':0,'yards':0.0,'possessions':set(),'red_zone_plays':0,'red_zone_tds':0,'punts':0,'drives':set(),'start_positions':[],'fg_attempts':0,'fg_made':0,'kick_returns':0,'punt_returns':0})
for season in SEASONS:
    url=BASE%season
    with urllib.request.urlopen(url) as resp:
        data=gzip.decompress(resp.read()).decode('utf-8',errors='replace')
    for r in csv.DictReader(io.StringIO(data)):
        if (r.get('season_type') or 'REG')!='REG': continue
        team=(r.get('posteam') or '').strip()
        gid=r.get('game_id'); play=(r.get('play_type') or '').strip()
        if not team or not gid or play not in {'pass','run','punt','field_goal','extra_point','qb_kneel','qb_spike'}: continue
        a=agg[(season,team)];a['games'].add(gid);a['plays']+=1
        try:a['yards']+=float(r.get('yards_gained') or 0)
        except ValueError:pass
        drive=r.get('drive') or ''
        if drive:
            a['possessions'].add((gid,drive));a['drives'].add((gid,drive))
            if (r.get('drive_play_id') or r.get('play_id') or '').endswith('1'):
                try:a['start_positions'].append(float(r.get('yardline_100') or 50))
                except ValueError:pass
        try:
            rz=float(r.get('yardline_100') or 999)<=20
        except ValueError: rz=False
        if rz:a['red_zone_plays']+=1
        if rz and r.get('td_team')==team:a['red_zone_tds']+=1
        if play=='punt':a['punts']+=1
        if play=='field_goal':
            a['fg_attempts']+=1
            if (r.get('field_goal_result') or '').lower()=='made':a['fg_made']+=1
        if play=='kickoff' and r.get('return_team')==team:a['kick_returns']+=1
        if play=='punt' and r.get('return_team')==team:a['punt_returns']+=1
out={}
for (season,team),a in sorted(agg.items()):
    g=max(1,len(a['games']))
    out.setdefault(team,{})[str(season)]={
      'games':g,'plays_per_game':round(a['plays']/g,3),'yards_per_play':round(a['yards']/max(1,a['plays']),3),
      'possessions_per_game':round(len(a['possessions'])/g,3),'red_zone_plays_per_game':round(a['red_zone_plays']/g,3),
      'red_zone_tds_per_game':round(a['red_zone_tds']/g,3),'punts_per_game':round(a['punts']/g,3),'starting_field_position_yardline_100_mean':round(sum(a['start_positions'])/len(a['start_positions']),3) if a['start_positions'] else None,'field_goals_attempted_per_game':round(a['fg_attempts']/g,3),'field_goals_made_per_game':round(a['fg_made']/g,3),'kick_returns_per_game':round(a['kick_returns']/g,3),'punt_returns_per_game':round(a['punt_returns']/g,3),
      'source':'nflverse play_by_play','status':'DESCRIPTIVE_PENDING_BACKTEST'
    }
result={'schema_version':'play-context.v1','history_window':SEASONS,'generated_at':datetime.now(timezone.utc).isoformat(),'sportsbook_inputs_used':False,'teams':out,'notes':['Travel distance requires stadium coordinates and is not inferred from team abbreviations.',
'Pace is represented by offensive plays and possessions per game.','Red-zone counts use plays with yardline_100 <= 20.','These are descriptive inputs and have zero betting authority until grouped backtesting.']}
outpath=ROOT/'data/probability/generated/play-context-measures-2023-2026.json';outpath.parent.mkdir(parents=True,exist_ok=True);outpath.write_text(json.dumps(result,indent=2)+'\n');(ROOT/'guardrails/play-context-measures-report.json').write_text(json.dumps({'result':'READY_FOR_BACKTEST','teams':len(out),'seasons':SEASONS,'sportsbook_inputs_used':False},indent=2)+'\n');print(json.dumps({'result':'READY_FOR_BACKTEST','teams':len(out),'seasons':SEASONS},indent=2))
