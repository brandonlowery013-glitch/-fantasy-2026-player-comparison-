import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const odds=read('vegasOdds2026.json');
const inputs=read('evProbabilityInputs2026.json');
const cfg=read('guardrails/guardrails-config.json');

const implied=o=>{o=Number(o);if(!Number.isFinite(o)||o===0)return null;return o<0?(-o)/((-o)+100):100/(o+100)};
const profit=o=>{o=Number(o);if(!Number.isFinite(o)||o===0)return null;return o<0?100/(-o):o/100};
const r6=n=>Number(Number(n).toFixed(6));
const marketKey=m=>`${m.book}|${m.stat}|${m.line}`;

const output={
  season:2026,
  mode:'SHADOW_ONLY',
  actionable:false,
  status:'NON_ACTIONABLE',
  source_odds_as_of:odds.as_of,
  probability_source:'evProbabilityInputs2026.json only',
  formula:'EV = p * b - (1 - p), where b is net profit per $1 risked',
  players:{}
};

for(const [name,pInput] of Object.entries(inputs.players||{})){
  const priced=odds.players?.[name]?.markets||[];
  if(!priced.length) throw new Error(`Probability input has no priced market: ${name}`);
  const markets={};
  for(const [key,probInput] of Object.entries(pInput.markets||{})){
    const m=priced.find(x=>marketKey(x)===key);
    if(!m) throw new Error(`Probability input does not match priced market: ${name} ${key}`);
    const modelOver=Number(probInput.model_over_probability);
    if(!Number.isFinite(modelOver)||modelOver<0||modelOver>1) throw new Error(`Invalid model_over_probability: ${name} ${key}`);
    const modelUnder=1-modelOver;
    const rawOver=implied(m.over),rawUnder=implied(m.under);
    if(rawOver==null||rawUnder==null) throw new Error(`Two-sided odds required: ${name} ${key}`);
    const sum=rawOver+rawUnder;
    const marketOver=rawOver/sum,marketUnder=rawUnder/sum;
    const overEv=modelOver*profit(m.over)-(1-modelOver);
    const underEv=modelUnder*profit(m.under)-(1-modelUnder);
    const side=overEv>=underEv?'OVER':'UNDER';
    const modelP=side==='OVER'?modelOver:modelUnder;
    const marketP=side==='OVER'?marketOver:marketUnder;
    const offered=side==='OVER'?m.over:m.under;
    const ev=side==='OVER'?overEv:underEv;
    const edge=modelP-marketP;
    const absEdge=Math.abs(edge);
    const guardrailStatus=absEdge>=cfg.probability.extreme_edge_review_threshold?'REVIEW_REQUIRED':'PASS';
    markets[key]={
      stat:m.stat,
      label:m.label,
      line:m.line,
      book:m.book,
      source_date:m.source_date,
      model_over_probability:r6(modelOver),
      model_under_probability:r6(modelUnder),
      market_over_probability:r6(marketOver),
      market_under_probability:r6(marketUnder),
      selected_side:side,
      model_probability:r6(modelP),
      market_probability:r6(marketP),
      probability_edge:r6(edge),
      offered_odds:offered,
      expected_value:r6(ev),
      guardrail_status:guardrailStatus,
      recommendation:'SHADOW_ONLY',
      actionable:false,
      probability_method:probInput.method||null,
      probability_generated_at:probInput.generated_at||null,
      independent_signals:Array.isArray(probInput.independent_signals)?probInput.independent_signals:[]
    };
  }
  if(Object.keys(markets).length) output.players[name]={markets};
}

const text=JSON.stringify(output,null,2)+'\n';
const target=path.join(root,'evLayer2026.json');
if(process.argv.includes('--check')){
  if(!fs.existsSync(target)) throw new Error('evLayer2026.json missing');
  const existing=fs.readFileSync(target,'utf8');
  if(existing!==text){
    console.error('evLayer2026.json is out of sync with EV inputs/odds.');
    process.exit(1);
  }
  console.log('EV shadow layer is synchronized.');
}else{
  fs.writeFileSync(target,text);
  console.log(`Wrote ${target}`);
}
