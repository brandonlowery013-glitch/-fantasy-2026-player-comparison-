import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const contract=JSON.parse(fs.readFileSync(path.join(root,'data/sources/comparison-decision-2026.json'),'utf8'));
fs.mkdirSync(path.join(root,'data/probability/generated'),{recursive:true});
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});
const finite=x=>Number.isFinite(Number(x));
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const round=(x,d=6)=>Number(Number(x).toFixed(d));
const weights=contract.head_to_head_weights;
const bands=contract.edge_bands;

function normalize10(x){return clamp(Number(x)/10)}
function edgeBand(gap){const a=Math.abs(gap);return (bands.find(b=>a>=Number(b.min_abs_gap)&&a<Number(b.max_abs_gap_exclusive))||bands.at(-1)).label}
function scorePlayer(p){
  const vals={
    expected_production:normalize10(p.expected_production),
    ceiling:normalize10(p.ceiling),
    role_volume:normalize10(p.role_volume),
    offensive_environment:normalize10(p.offensive_environment),
    risk_safety:clamp(1-Number(p.risk_score))
  };
  for(const [k,v] of Object.entries(vals))if(!finite(v))throw new Error(`non-finite ${k} for ${p.name}`);
  const score=Object.entries(vals).reduce((s,[k,v])=>s+Number(weights[k])*v,0);
  if(!finite(score)||score<0||score>1)throw new Error(`comparison score outside [0,1] for ${p.name}`);
  return {score,components:vals};
}
function priceLabel(p){
  const x=String(p.price_label||'FAIR').toUpperCase();
  return contract.price_separation.standalone_price_labels.includes(x)?x:'FAIR';
}
function componentEdges(a,b){
  const labels={expected_production:'production',ceiling:'ceiling',risk_safety:'risk',role_volume:'role',offensive_environment:'environment'};
  const rows=[];
  for(const key of contract.public_language.winner_explanation_order.map(x=>Object.keys(labels).find(k=>labels[k]===x))){
    if(!key)continue;
    const d=a.components[key]-b.components[key];
    rows.push({key,label:labels[key],gap:d,abs:Math.abs(d)});
  }
  return rows.sort((x,y)=>y.abs-x.abs);
}
function explanation(a,b,band,winner){
  if(band==='TOSS_UP')return `This is essentially even on the football profile; neither player has a meaningful overall edge. Use roster construction and draft cost as separate tiebreakers.`;
  const rows=componentEdges(a,b);
  const positive=rows.filter(r=>(winner==='A'?r.gap:-r.gap)>0.025).slice(0,2);
  const negative=rows.find(r=>(winner==='A'?r.gap:-r.gap)<-0.025);
  const lead=band==='SLIGHT_EDGE'?'holds a slight edge':band==='EDGE'?'has the edge':'has a clear edge';
  let text=`${winner==='A'?a.name:b.name} ${lead}`;
  if(positive.length)text+=` behind the stronger ${positive.map(x=>x.label).join(' and ')} profile`;
  text+='.';
  if(negative)text+=` ${winner==='A'?b.name:a.name} has the better ${negative.label} mark, but it is not enough to erase the overall gap.`;
  return text;
}
function compare(pa,pb){
  const A={name:pa.name,...scorePlayer(pa)},B={name:pb.name,...scorePlayer(pb)};
  const gap=A.score-B.score,band=edgeBand(gap);
  const winner=band==='TOSS_UP'?null:(gap>0?'A':'B');
  return {
    status:contract.mode,actionable:contract.actionable,
    players:{A:pa.name,B:pb.name},
    scores:{A:round(A.score),B:round(B.score),gap:round(gap)},
    verdict:band,
    winner:winner? (winner==='A'?pa.name:pb.name):null,
    better_player_label:band==='TOSS_UP'?'Toss-up':(winner==='A'?pa.name:pb.name),
    explanation:explanation(A,B,band,winner),
    standalone_price:{[pa.name]:priceLabel(pa),[pb.name]:priceLabel(pb)},
    price_labels_used_in_head_to_head:false,
    adp_used_in_head_to_head:false,
    sportsbook_used_in_head_to_head:false,
    duplicate_injury_penalty_applied:false
  };
}

function selfTest(){
  const stable={name:'Stable WR',expected_production:9.1,ceiling:8.9,role_volume:9.2,offensive_environment:8.7,risk_score:.22,adp:18,price_label:'FAIR',sportsbook:{line:80.5}};
  const fragile={name:'Fragile WR',expected_production:9.0,ceiling:9.5,role_volume:8.5,offensive_environment:8.4,risk_score:.62,adp:45,price_label:'BUY',sportsbook:{line:95.5}};
  const slight={name:'Slight RB',expected_production:8.8,ceiling:8.7,role_volume:8.6,offensive_environment:8.4,risk_score:.28,adp:30,price_label:'REACH'};
  const slight2={name:'Slight RB 2',expected_production:8.55,ceiling:8.45,role_volume:8.5,offensive_environment:8.35,risk_score:.30,adp:10,price_label:'BUY'};
  const twin={...stable,name:'Twin WR',adp:1,price_label:'FADE',sportsbook:{line:200}};
  return {stable,fragile,slight,slight2,twin};
}

const blocked=[];let comparisons=[];
try{
  if(contract.mode!=='PRODUCTION_COMPARISON_RUNTIME'||contract.actionable!==true)blocked.push('Step 5 contract must be production comparison runtime/actionable');
  if(contract.production_gate?.step_6a_calibration_complete!==true||contract.production_gate?.step_6b_preseason_risk_bridge_complete!==true)blocked.push('Step 5 production prerequisites are not complete');
  if(process.argv.includes('--self-test')){
    const s=selfTest();
    const risk=compare(s.stable,s.fragile);comparisons.push(risk);
    if(risk.winner!=='Stable WR')blocked.push('Risk-aware self-test failed: stable profile should beat fragile profile');
    const priceMutation=compare({...s.stable,adp:250,price_label:'FADE',sportsbook:{line:1}}, {...s.fragile,adp:1,price_label:'BUY',sportsbook:{line:999}});
    if(priceMutation.winner!==risk.winner||priceMutation.verdict!==risk.verdict||priceMutation.scores.gap!==risk.scores.gap)blocked.push('Head-to-head result changed after ADP/price/sportsbook mutation');
    comparisons.push(priceMutation);
    const close=compare(s.slight,s.slight2);comparisons.push(close);
    if(!['TOSS_UP','SLIGHT_EDGE'].includes(close.verdict))blocked.push(`Close-profile test produced ${close.verdict}`);
    const toss=compare(s.stable,s.twin);comparisons.push(toss);
    if(toss.verdict!=='TOSS_UP'||toss.winner!==null||!/^This is essentially even/.test(toss.explanation))blocked.push('TOSS_UP handling failed');
    const forbidden=(contract.public_language.forbidden_terms||[]).map(x=>String(x).toLowerCase());
    for(const c of comparisons){
      const text=c.explanation.toLowerCase();
      for(const x of forbidden)if(text.includes(x))blocked.push(`Forbidden public term appeared in explanation: ${x}`);
      const sentences=(c.explanation.match(/[.!?](?:\s|$)/g)||[]).length;
      if(sentences>Number(contract.public_language.max_sentences))blocked.push('Explanation exceeded sentence cap');
      if(c.price_labels_used_in_head_to_head||c.adp_used_in_head_to_head||c.sportsbook_used_in_head_to_head||c.duplicate_injury_penalty_applied)blocked.push('Forbidden comparison contamination flag');
    }
  } else {
    const inputPath=path.join(root,'data/probability/comparison-decision-inputs-2026.json');
    if(fs.existsSync(inputPath)){
      const input=JSON.parse(fs.readFileSync(inputPath,'utf8'));
      for(const x of input.comparisons||[])comparisons.push(compare(x.player_a,x.player_b));
    }
  }
}catch(e){blocked.push(e.message)}

const generated_at=new Date().toISOString();
const output={schema_version:'1.1.0',season:2026,generated_at,status:process.argv.includes('--self-test')?'SELF_TEST':contract.mode,mode:contract.mode,actionable:contract.actionable,comparisons};
const report={generated_at,result:blocked.length?'BLOCKED':'PASS',mode:contract.mode,actionable:contract.actionable,comparisons_tested:comparisons.length,price_separation_verified:!blocked.some(x=>x.includes('ADP/price/sportsbook')),toss_up_handling_verified:!blocked.some(x=>x.includes('TOSS_UP')),public_language_verified:!blocked.some(x=>x.includes('Forbidden public term')||x.includes('sentence cap')),blocked};
fs.writeFileSync(path.join(root,'data/probability/generated/comparison-decisions-2026.json'),JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(path.join(root,'guardrails/comparison-decision-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);

export {compare};
