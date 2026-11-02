import datetime as dt
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('engine',Path(__file__).with_name('learning.py'))
engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)

class LearningTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.state=Path(self.tmp.name);self.db=engine.db_open(self.state)
  self.now=dt.datetime.now(dt.timezone.utc)
  self.record=dict(season=2026,week=9,game_id='TEST_GAME',player='Test WR',player_id='TEST_ID',pfr_id='TEST_PFR',position='WR',metric='receptions',
   kickoff=engine.iso(self.now+dt.timedelta(minutes=20)),data_through_week=8,inputs_observed_at=engine.iso(self.now-dt.timedelta(minutes=1)),
   raw_mean=10.,raw_sd=2.,location=10.,sd=2.,lower=0.,p10=7.,p50=10.,p90=13.,calibrated=True,workload=1.,availability='Playing',parameter_version='seed',model_version='test',quotes=[])
  self.seed={'calibration':[{'key':'WR|receptions','pos':'WR','metric':'receptions','bias_z':0.,'scale':1.}]}
 def tearDown(self):self.db.close();self.tmp.cleanup()
 def frozen(self):engine.freeze(self.db,self.record,self.state);return next(iter(engine.latest_forecasts(self.db).values()))
 def after_game(self):return patch.object(engine,'utcnow',return_value=self.now+dt.timedelta(hours=4))
 def test_no_backdating_or_target_week_leakage(self):
  bad=dict(self.record,captured_at=engine.iso(self.now-dt.timedelta(days=1)))
  with self.assertRaises(ValueError):engine.freeze(self.db,bad,self.state)
  bad=dict(self.record,data_through_week=9)
  with self.assertRaises(ValueError):engine.freeze(self.db,bad,self.state)
  self.assertFalse(engine.freeze(self.db,dict(self.record,kickoff=engine.iso(self.now-dt.timedelta(seconds=1))),self.state))
 def test_stale_inputs_rejected(self):
  with self.assertRaises(ValueError):engine.freeze(self.db,dict(self.record,inputs_observed_at=engine.iso(self.now-dt.timedelta(days=2))),self.state)
 def test_frozen_forecast_protected(self):
  f=self.frozen()
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute('UPDATE forecasts SET captured_at=?',(engine.iso(self.now),))
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute('DELETE FROM forecasts')
  self.assertEqual(next(iter(engine.latest_forecasts(self.db).values()))['id'],f['id'])
 def test_final_only_and_no_assumed_missing_zero(self):
  self.frozen()
  with self.after_game():
   self.assertEqual(engine.grade(self.db,{}, {},{},self.state),0)
   self.assertEqual(engine.grade(self.db,{'TEST_GAME':'fixture final'}, {},{},self.state),0)
 def test_future_final_flag_cannot_grade(self):
  self.frozen()
  self.assertEqual(engine.grade(self.db,{'TEST_GAME':'fixture'}, {('TEST_GAME','TEST_ID'):{'targets':12,'receptions':11}}, {},self.state),0)
 def test_played_zero_and_dnp_are_different(self):
  self.frozen()
  with self.after_game():
   engine.grade(self.db,{'TEST_GAME':'fixture'}, {},{('TEST_GAME','TEST_PFR'):15},self.state)
   grade=next(iter(engine.latest_grades(self.db).values()))
   self.assertEqual(grade['result']['actual'],0)
   self.assertTrue(grade['result']['performance_eligible'])
   engine.grade(self.db,{'TEST_GAME':'fixture correction'}, {},{('TEST_GAME','TEST_PFR'):0},self.state)
   grade=next(iter(engine.latest_grades(self.db).values()))
   self.assertEqual(grade['result']['status'],'DNP / void')
   self.assertFalse(grade['result']['performance_eligible'])
 def test_grading_idempotent_and_recalibration_uses_only_closed_weeks(self):
  frozen=self.frozen();actual={('TEST_GAME','TEST_ID'):{'targets':15,'receptions':14}}
  with self.after_game():
   self.assertEqual(engine.grade(self.db,{'TEST_GAME':'fixture'},actual,{},self.state),1)
   self.assertEqual(engine.grade(self.db,{'TEST_GAME':'fixture'},actual,{},self.state),0)
  held=engine.recalibrate(self.db,self.seed,self.state,completed_weeks=[])
  self.assertEqual(held['parameters']['WR|receptions']['live_n'],0)
  learned=engine.recalibrate(self.db,self.seed,self.state,completed_weeks=[9])
  self.assertEqual(learned['parameters']['WR|receptions']['live_n'],1)
  self.assertGreater(learned['parameters']['WR|receptions']['bias_z'],0)
  again=engine.recalibrate(self.db,self.seed,self.state,completed_weeks=[9]);self.assertEqual(again['id'],learned['id'])
  self.assertEqual(next(iter(engine.latest_forecasts(self.db).values()))['p50'],frozen['p50'])
 def test_status_precedence(self):
  p={'name':"De'Von Achane",'pos':'RB','source_team':'MIA'}
  roster=[dict(full_name=p['name'],position='RB',status='RES',status_description_abbr='R01',team='MIA',gsis_id='A',espn_id='1',pfr_id='a')]
  espn=[dict(athlete={'id':'1','displayName':p['name']},status='Active',date=engine.iso(self.now))]
  a=engine.availability(p,roster,[],espn,{'game_id':'test'},{},self.now)
  self.assertEqual(a['status'],'Out (IR)');self.assertEqual(a['workload'],0)
  roster[0]['status']='ACT';roster[0]['status_description_abbr']='A01'
  a=engine.availability(p,roster,[{'gsis_id':'A','report_status':'Questionable'}],espn,{'game_id':'test'},{},self.now)
  self.assertEqual(a['status'],'Playing')
 def test_integer_line_push_and_half_line(self):
  po,pu,pp=engine.prob(10.,2.,0,10.)
  self.assertGreater(pp,0);self.assertAlmostEqual(po+pu+pp,1)
  self.assertAlmostEqual(engine.prob(10.,2.,0,10.5)[2],0)
 def test_previous_week_inactive_is_not_carried_as_new_week_out(self):
  p={'name':'Test WR','pos':'WR','source_team':'MIA'}
  roster=[dict(full_name='Test WR',position='WR',status='ACT',status_description_abbr='A01',team='MIA',gsis_id='X',espn_id='9',pfr_id='x')]
  news=[dict(athlete={'id':'9','displayName':'Test WR'},status='Out',date=engine.iso(self.now-dt.timedelta(days=2)),shortComment='Inactive last week')]
  a=engine.availability(p,roster,[],news,{'game_id':'test'},{},self.now,self.now-dt.timedelta(days=1))
  self.assertEqual(a['status'],'Playing')

if __name__=='__main__':unittest.main(verbosity=2)
