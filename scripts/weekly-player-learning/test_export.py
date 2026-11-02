import unittest,tempfile,json,os,datetime as dt
from pathlib import Path
import export_playerboard as e
class ExportTests(unittest.TestCase):
 def test_shared_distribution_and_started_game_preservation(self):
  template=json.loads((e.ROOT/'playerboard-template.json').read_text());future='Jaxon Smith-Njigba'
  rows=[{'name':n,'kickoff':(dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=1)).isoformat() if n==future else '2026-11-01T18:00:00+00:00','availability':{'status':'Out (injury)'},'distributions':{'ppr':{'p10':0,'p50':0,'p90':0}}} for n in template['players']]
  report={'players':rows,'week':8,'generated_at':dt.datetime.now(dt.timezone.utc).isoformat(),'parameters':{'id':'test'},'live_calibration_records':0}
  old=os.environ.get('CTD_LEARNING_STATE')
  try:
   with tempfile.TemporaryDirectory() as d:
    os.environ['CTD_LEARNING_STATE']=d;out=json.loads(e.export(report).read_text())
    self.assertEqual(out['players']['Jahmyr Gibbs']['weekly_median'],template['players']['Jahmyr Gibbs']['weekly_median'])
    self.assertIsNone(out['players'][future]['weekly_overall_rank']);self.assertEqual(out['players'][future]['weekly_median'],0)
    ranked=sorted((r for r in out['players'].values() if r['weekly_overall_rank']),key=lambda r:r['weekly_overall_rank'])
    self.assertEqual([r['weekly_median'] for r in ranked],sorted([r['weekly_median'] for r in ranked],reverse=True));self.assertEqual(len(out['players']),197)
  finally:
   if old is None:os.environ.pop('CTD_LEARNING_STATE',None)
   else:os.environ['CTD_LEARNING_STATE']=old
if __name__=='__main__':unittest.main()
