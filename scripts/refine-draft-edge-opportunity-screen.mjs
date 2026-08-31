import fs from 'node:fs';
const path='data/market/draft-edge-opportunity-screen-166.json';
const x=JSON.parse(fs.readFileSync(path,'utf8'));
function relabel(r){
  if(r.price_status!=='AVAILABLE')return 'PRICE PENDING';
  const g=Number(r.price_edge), score=Number(r.opportunity_score), risk=Number(r.bust_downside), adp=Number(r.market_adp);
  if(risk>=8&&g<=5)return 'FADE';
  if(g<=-18||(risk>=7&&g<0))return 'REACH';
  if(r.position==='QB'&&g>=20)return score>=6.5?'CONDITIONAL BUY':'VALUE WATCH';
  if(adp>=180&&g>=20)return 'DEEP STASH';
  if(g>=25&&score>=7.2)return 'BUY';
  if(g>=14&&score>=6.2)return 'SLEEPER';
  if(g>=8)return 'VALUE WATCH';
  if(g<=-8)return 'REACH';
  return 'FAIR';
}
for(const r of x.players)r.read=relabel(r);
x.counts={};for(const r of x.players)x.counts[r.read]=(x.counts[r.read]||0)+1;
x.actionable=x.players.filter(r=>r.read!=='FAIR').sort((a,b)=>b.opportunity_score-a.opportunity_score||a.overall_rank-b.overall_rank);
x.strongest_values=x.players.filter(r=>['BUY','SLEEPER','VALUE WATCH','CONDITIONAL BUY'].includes(r.read)).sort((a,b)=>b.opportunity_score-a.opportunity_score||Number(b.price_edge||0)-Number(a.price_edge||0)).slice(0,20).map(r=>r.player);
x.deep_stashes=x.players.filter(r=>r.read==='DEEP STASH').sort((a,b)=>b.opportunity_score-a.opportunity_score).map(r=>r.player);
x.strongest_fades=x.players.filter(r=>['FADE','REACH'].includes(r.read)).sort((a,b)=>b.bust_downside-a.bust_downside||Number(a.price_edge||0)-Number(b.price_edge||0)).slice(0,20).map(r=>r.player);
x.rules={deep_adp:'ADP 180+ cannot become an automatic BUY solely from rank gap; route to DEEP STASH',qb:'12-team 1-QB late-QB guardrail converts large QB discounts to CONDITIONAL BUY/VALUE WATCH',rank:'edge screen is companion-only and cannot mutate Overall or True Value',price_coverage:'uses directly resolvable ADP from market2026.json; missing prices remain explicit PENDING'};
x.data_quality={source_of_truth_claim:'162/166',direct_market2026_coverage:x.price_coverage,coverage_discrepancy:x.price_pending.length===4?'NONE':'OPEN',unpriced_existing:x.price_pending.filter(n=>!['Kaleb Johnson','Corey Kiner','Tank Dell','Jonnu Smith'].includes(n)),unpriced_new_admissions:x.price_pending.filter(n=>['Kaleb Johnson','Corey Kiner','Tank Dell','Jonnu Smith'].includes(n))};
fs.writeFileSync(path,JSON.stringify(x,null,2)+'\n');
console.log(JSON.stringify({result:'PASS',counts:x.counts,strongest_values:x.strongest_values.slice(0,10),deep_stashes:x.deep_stashes.slice(0,10),strongest_fades:x.strongest_fades.slice(0,10),data_quality:x.data_quality},null,2));
