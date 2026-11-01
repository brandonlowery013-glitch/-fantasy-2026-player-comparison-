import base64,gzip,json,os,sqlite3,shutil
from pathlib import Path
import learning as e
root=Path(__file__).resolve().parent
if not (root/'seed.json').exists():
 raw=''.join(p.read_text() for p in sorted(root.glob('seed-*.b64'),key=lambda p:int(p.stem.split('-')[-1])))
 (root/'seed.json').write_bytes(gzip.decompress(base64.b64decode(raw)))
state=e.STATE;state.mkdir(parents=True,exist_ok=True)
if not (state/'learning.sqlite3').exists():
 db=e.db_open(state);raw=''.join(p.read_text() for p in sorted(root.glob('bootstrap-ledger-*.b64'),key=lambda p:int(p.stem.split('-')[-1])))
 ledger=json.loads(gzip.decompress(base64.b64decode(raw)))
 for table in ['forecasts','grades','parameter_versions']:
  for row in ledger[table]:db.execute('INSERT INTO '+table+' VALUES('+','.join('?' for _ in row)+')',row)
 db.commit();e.latest_forecasts(db);db.close()
if not (state/'reconstruction.json').exists():
 raw=''.join(p.read_text() for p in sorted(root.glob('replay-*.b64'),key=lambda p:int(p.stem.split('-')[-1])))
 (state/'reconstruction.json').write_bytes(gzip.decompress(base64.b64decode(raw)))
for name in ['reconstruction_current.json']:
 if not (state/name).exists():shutil.copyfile(root/name,state/name)
print(json.dumps(e.cycle(offline='--offline' in __import__('sys').argv,render=False),indent=2))
