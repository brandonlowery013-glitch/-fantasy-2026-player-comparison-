import importlib.util,json,copy
spec=importlib.util.spec_from_file_location('n','scripts/rerun-matchup-narrative.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
r=json.load(open('data/market/all-game-model-rerun-2026.json'));c=json.load(open('data/probability/generated/structured-matchup-context-2026.json'))
original=json.dumps(r,sort_keys=True)
for g in r['games'].values():
 s=next(x for x in g['snapshot_evaluations'] if x['snapshot_id']==g['current_recommendations']['snapshot_id'])
 assert len(m.matchup_sections(g,c))==2
 for k in ['spread','moneyline','total']:
  q=g['current_recommendations'][k];text=' '.join(t for _,t in m.pick_narrative(g,s,k))
  assert 'None' not in text and 'nan' not in text
  if q.get('selection'):
   assert q['selection'] in text
   assert f"{q['model_conditional_win_probability']*100:.1f}%" in text
   assert f"${q['expected_value']*10:.2f}" in text
  else:assert 'The estimated average profit' not in text
 wrong=copy.deepcopy(g);wrong['kickoff']='2026-10-11T00:00:00.000Z';assert m.matchup_sections(wrong,c)==[]
assert json.dumps(r,sort_keys=True)==original
missing=copy.deepcopy(c)
missing["players"]={}
for t in missing['teams'].values():
 for k in t['offense']:t['offense'][k]=None
 for k in t['defense']:t['defense'][k]=None
 t['play_context']={}
assert m.matchup_sections(next(iter(r['games'].values())),missing)==[]
print('PASS: 48 market narratives; exact saved selection/probability/EV; identity rejection; missing data; source immutability')
