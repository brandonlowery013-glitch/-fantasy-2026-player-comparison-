import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {FAIR_MARKET_METHOD,fairTwoWayAmerican} from '../lib/fair-market-probability.mjs';

const root=process.cwd();
const r6=n=>Number(Number(n).toFixed(6));
const keyFor=m=>`${m.book}|${m.stat}|${m.line}`;
const consensusKey=(player,m)=>`${player}|${m.stat}|${m.line}`;

function priceMarket(m){
  if(m?.over==null||m?.under==null)throw new Error(`Two-sided odds required for ${m?.book||'UNKNOWN'} ${m?.stat||'UNKNOWN'} ${m?.line??'UNKNOWN'}`);
  const f=fairTwoWayAmerican(m.over,m.under);
  return {
    stat:m.stat,
    label:m.label||null,
    line:Number(m.line),
    book:m.book,
    source_date:m.source_date||null,
    over_odds:Number(m.over),
    under_odds:Number(m.under),
    raw_over_probability:r6(f.raw_side_a_probability),
    raw_under_probability:r6(f.raw_side_b_probability),
    raw_probability_sum:r6(f.raw_probability_sum),
    book_margin:r6(f.book_margin),
    fair_over_probability:r6(f.fair_side_a_probability),
    fair_under_probability:r6(f.fair_side_b_probability),
    fair_over_american:r6(f.fair_side_a_american),
    fair_under_american:r6(f.fair_side_b_american),
    method:FAIR_MARKET_METHOD,
    actionable:false
  };
}

export function buildFairMarketLayer(odds){
  const players={};
  const groups=new Map();
  let marketCount=0;
  for(const [player,p] of Object.entries(odds.players||{})){
    const markets={};
    for(const m of p.markets||[]){
      const priced=priceMarket(m);
      markets[keyFor(m)]=priced;
      const ck=consensusKey(player,m);
      if(!groups.has(ck))groups.set(ck,{player,stat:m.stat,label:m.label||null,line:Number(m.line),markets:[]});
      groups.get(ck).markets.push(priced);
      marketCount++;
    }
    if(Object.keys(markets).length)players[player]={markets};
  }
  const consensus={};
  for(const [id,g] of groups.entries()){
    const n=g.markets.length;
    const fairOver=g.markets.reduce((s,m)=>s+m.fair_over_probability,0)/n;
    const fairUnder=g.markets.reduce((s,m)=>s+m.fair_under_probability,0)/n;
    consensus[id]={
      player:g.player,
      stat:g.stat,
      label:g.label,
      line:g.line,
      books:g.markets.map(m=>m.book),
      book_count:n,
      fair_over_probability:r6(fairOver),
      fair_under_probability:r6(fairUnder),
      method:'EQUAL_WEIGHT_MEAN_OF_BOOK_FAIR_PROBABILITIES',
      identical_line_only:true,
      actionable:false
    };
  }
  return {
    schema_version:'1.0.0',
    season:2026,
    status:'STEP_13_FAIR_MARKET_PROBABILITY_LOCKED',
    mode:'SHADOW_ONLY',
    actionable:false,
    source_odds_as_of:odds.as_of||null,
    source:'vegasOdds2026.json',
    devig_method:FAIR_MARKET_METHOD,
    market_count:marketCount,
    consensus_group_count:Object.keys(consensus).length,
    players,
    consensus
  };
}

function selfTest(){
  const sample={as_of:'2026-01-01',players:{Test:{markets:[
    {stat:'receiving_yards',label:'Receiving yards',line:99.5,over:-110,under:-110,book:'A',source_date:'2026-01-01'},
    {stat:'receiving_yards',label:'Receiving yards',line:99.5,over:-120,under:100,book:'B',source_date:'2026-01-01'},
    {stat:'receiving_yards',label:'Receiving yards',line:100.5,over:100,under:-120,book:'B',source_date:'2026-01-01'}
  ]}}};
  const out=buildFairMarketLayer(sample);
  assert.equal(out.market_count,3);
  assert.equal(out.consensus_group_count,2);
  const even=out.players.Test.markets['A|receiving_yards|99.5'];
  assert.equal(even.fair_over_probability,0.5);
  assert.equal(even.fair_under_probability,0.5);
  assert.ok(Math.abs(even.book_margin-0.047619)<1e-6);
  const c=out.consensus['Test|receiving_yards|99.5'];
  assert.equal(c.book_count,2);
  assert.ok(Math.abs((c.fair_over_probability+c.fair_under_probability)-1)<2e-6);
  assert.equal(out.consensus['Test|receiving_yards|100.5'].book_count,1);
  console.log('Step 13 fair-market layer self-test passed.');
}

if(process.argv.includes('--self-test')){
  selfTest();
  process.exit(0);
}

const odds=JSON.parse(fs.readFileSync(path.join(root,'vegasOdds2026.json'),'utf8'));
const output=buildFairMarketLayer(odds);
const target=path.join(root,'data/market/fair-market-probabilities-2026.json');
fs.mkdirSync(path.dirname(target),{recursive:true});
const text=JSON.stringify(output,null,2)+'\n';
if(process.argv.includes('--check')){
  if(!fs.existsSync(target))throw new Error('data/market/fair-market-probabilities-2026.json missing');
  if(fs.readFileSync(target,'utf8')!==text){console.error('Fair-market probability layer is out of sync.');process.exit(1);}
  console.log('Fair-market probability layer is synchronized.');
}else{
  fs.writeFileSync(target,text);
  fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});
  fs.writeFileSync(path.join(root,'guardrails/fair-market-probability-layer-report.json'),JSON.stringify({result:'PASS',market_count:output.market_count,consensus_group_count:output.consensus_group_count,method:output.devig_method,actionable:false},null,2)+'\n');
  console.log(`Wrote ${target} with ${output.market_count} priced markets.`);
}
