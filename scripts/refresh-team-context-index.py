"""Stage and validate context before replacing output. Free references cached six hours."""
import csv,io,subprocess,sys,urllib.request,tempfile,json,time,shutil
from pathlib import Path
root=Path('data/team-context');root.mkdir(exist_ok=True)
sources={'games.csv':'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv','teams.csv':'https://raw.githubusercontent.com/nflverse/nflverse-pbp/master/teams_colors_logos.csv','team-stats.csv':'https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_2026.csv'}
manifest=root/'reference-fetch.json';previous=json.loads(manifest.read_text()) if manifest.exists() else {};now=time.time()
with tempfile.TemporaryDirectory() as tmp:
 stage=Path(tmp);nextmeta={}
 for file,url in sources.items():
  old=previous.get(file,{})
  if (root/file).exists() and 0<=now-old.get('fetched_at_epoch',0)<21600:
   shutil.copyfile(root/file,stage/file);nextmeta[file]=old;continue
  data=urllib.request.urlopen(url,timeout=45).read().decode();rows=list(csv.DictReader(io.StringIO(data)));assert rows,file
  if file=='games.csv':rows=[r for r in rows if r['season'] in ('2024','2025','2026')]
  buf=io.StringIO();w=csv.DictWriter(buf,fieldnames=rows[0].keys());w.writeheader();w.writerows(rows);(stage/file).write_text(buf.getvalue())
  nextmeta[file]={'url':url,'fetched_at_epoch':now}
 subprocess.run([sys.executable,'scripts/build-team-context-index.py','--source','.','--output',str(stage)],check=True)
 subprocess.run([sys.executable,'scripts/enrich-team-context-index.py','--root',str(stage)],check=True)
 (stage/'reference-fetch.json').write_text(json.dumps(nextmeta,indent=2)+'\n')
 for path in stage.iterdir():
  target=root/path.name;data=path.read_bytes()
  if not target.exists() or target.read_bytes()!=data:
   pending=root/(path.name+'.tmp');pending.write_bytes(data);pending.replace(target)
