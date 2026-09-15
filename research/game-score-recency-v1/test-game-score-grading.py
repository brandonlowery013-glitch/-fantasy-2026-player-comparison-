import copy, importlib.util, pathlib, unittest
spec=importlib.util.spec_from_file_location('grader',pathlib.Path(__file__).with_name('grade-game-score-comparison.py'));g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)

class GradingTests(unittest.TestCase):
    def setUp(self):
        f={'home_points':24,'away_points':20,'total':44,'home_margin':4}
        self.capture={'experiment':'test','captured_at':'2026-09-15T12:00:00Z','games':[{'event_id':'1','home':'LA','away':'WAS','kickoff':'2026-09-20T17:00Z','forecasts':{'baseline_method':f,'recency_v1':dict(f,home_points=25,total=45,home_margin=5)}}]}
        self.board={'games':[{'event_id':'1','home':{'team':'LAR','score':27},'away':{'team':'WSH','score':20},'start_at':'2026-09-20T17:00:00Z','state':'post'}]}
    def test_final_and_immutable(self):
        original=copy.deepcopy(self.capture);r=g.grade(self.capture,self.board)
        self.assertEqual(r['summary']['baseline_method']['total_mae'],3)
        self.assertEqual(r['summary']['recency_v1']['total_mae'],2)
        self.assertEqual(r['promotion_decision'],'HOLD');self.assertEqual(self.capture,original)
    def test_pending(self):
        self.board['games'][0]['state']='in';self.assertEqual(g.grade(self.capture,self.board)['pending_games'],1)
    def test_missing_result(self):
        self.board['games']=[];self.assertIsNone(g.grade(self.capture,self.board)['summary']['baseline_method'])
    def test_wrong_team(self):
        self.board['games'][0]['home']['team']='KC'
        with self.assertRaises(ValueError):g.grade(self.capture,self.board)
    def test_null_score(self):
        self.board['games'][0]['home']['score']=None
        with self.assertRaises(ValueError):g.grade(self.capture,self.board)
    def test_after_kickoff(self):
        self.capture['captured_at']='2026-09-21T00:00:00Z'
        with self.assertRaises(ValueError):g.grade(self.capture,self.board)
    def test_duplicate_result(self):
        self.board['games']*=2
        with self.assertRaises(ValueError):g.grade(self.capture,self.board)
    def test_changed_kickoff(self):
        self.board['games'][0]['start_at']='2026-09-21T17:00Z'
        with self.assertRaises(ValueError):g.grade(self.capture,self.board)

if __name__=='__main__':unittest.main()
