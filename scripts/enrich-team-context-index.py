"""Join saved nflverse season schedules and team box statistics without paid requests."""
import csv,json,hashlib,argparse
from pathlib import Path
ap=argparse.ArgumentParser();ap.add_argument('--root',type=Path,default=Path('data/team-context'));args=ap.parse_args()
root=args.root;p=root/'team-master-2026.json';d=json.loads(p.read_text())
def canon(t):return {'LAR':'LA','WSH':'WAS'}.get(t,t)
def rows(path):
 raw=(root/Path(path).name).read_bytes();d['sources'][path]={'sha256':hashlib.sha256(raw).hexdigest(),'source_url':{'games.csv':'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv','team-stats.csv':'https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_2026.csv','teams.csv':'https://raw.githubusercontent.com/nflverse/nflverse-pbp/master/teams_colors_logos.csv'}[Path(path).name],'freshness':'saved snapshot; not freshly fetched'};return list(csv.DictReader(raw.decode().splitlines()))
games=rows('data/team-context/games.csv');stats=rows('data/team-context/team-stats.csv')
season=[g for g in games if g['season']=='2026' and g['game_type']=='REG'];assert len({g['game_id'] for g in season})==len(season)
for t,team in d['teams'].items():
 gs=[g for g in season if t in (canon(g['home_team']),canon(g['away_team']))];assert len(gs)==17,(t,len(gs))
 team['season_schedule']=gs
 team['team_box_statistics']=[g for g in stats if canon(g['team'])==t and g['season_type']=='REG']
 past=[g for g in gs if g['home_score'] and g['away_score']];pf=pa=0;w=l=tie=0
 for g in past:
  own=float(g['home_score'] if canon(g['home_team'])==t else g['away_score']);opp=float(g['away_score'] if canon(g['home_team'])==t else g['home_score']);pf+=own;pa+=opp;w+=own>opp;l+=own<opp;tie+=own==opp
 team['season_results']={'games':len(past),'wins':w,'losses':l,'ties':tie,'points_for':pf,'points_allowed':pa,'source':'saved nflverse schedule','scope':'only scores present in this snapshot'}
 coaches=[(g['gameday'],g['home_coach'] if canon(g['home_team'])==t else g['away_coach']) for g in past];coaches=[x for x in coaches if x[1]]
 team['last_observed_head_coach']={'name':sorted(coaches)[-1][1],'game_date':sorted(coaches)[-1][0],'current_confirmation':False} if coaches else None
 team['gaps'].remove('division_and_full_season_schedule_not_joined');team['gaps'].append('division_metadata_not_joined')
 team['historical_season_results']={}
 for year in ('2024','2025'):
  h=[g for g in games if g['season']==year and g['game_type']=='REG' and t in (canon(g['home_team']),canon(g['away_team'])) and g['home_score'] and g['away_score']]
  team['historical_season_results'][year]={'games':len(h),'points_for':sum(float(g['home_score'] if canon(g['home_team'])==t else g['away_score']) for g in h),'points_allowed':sum(float(g['away_score'] if canon(g['home_team'])==t else g['home_score']) for g in h)}
meta={canon(x['team_abbr']):x for x in rows('data/team-context/teams.csv')}
for t,team in d['teams'].items():
 team['identity']=meta[t];team['gaps'].remove('division_metadata_not_joined')
d['season_game_results']={g['game_id']:g for g in season if g['home_score'] and g['away_score']}
d['automatic_refresh_connected']=True
d['automatic_refresh_verified']=False
p.write_text(json.dumps(d,indent=2)+'\n')
print(json.dumps({'teams':len(d['teams']),'schedule_games':len(season),'completed_games':len(d['season_game_results']),'team_box_rows':len(stats),'coaches_observed':sum(bool(t['last_observed_head_coach']) for t in d['teams'].values())}))
