import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const json=p=>JSON.parse(read(p));
const failures=[];
const need=(ok,msg)=>{if(!ok)failures.push(msg)};

const contract=json('data/sources/final-interface-functional-step5-2026.json');
const ui=read('runtime-final-interface-2026.js');
const betting=read('runtime-final-betting-pipeline-2026.js');
const builder=read('scripts/build-final-betting-ui-feed.mjs');
const index=read('index.html');

need(contract.status==='LOCKED','Step 5 contract must be LOCKED');
need(contract.build_your_own.minimum_legs===2&&contract.build_your_own.maximum_legs===12,'Build Your Own must remain 2-12 legs');
need(contract.build_your_own.same_game_independence_fallback===false,'Same-game independence fallback must be forbidden');
need(contract.build_your_own.cross_book_executable===false,'Cross-book ticket must not be represented as executable');
for(const x of ['Player Board','Compare','Weekly','Games'])need(ui.includes(x),`missing top navigation ${x}`);
for(const x of ['data-game-tab="bets"','data-game-tab="props"','data-game-tab="parlays"','keydown','Enter','selectedGameKey','renderGameDetail'])need(ui.includes(x),`missing game control wiring ${x}`);
for(const x of ['Analyze Ticket','Remove Weakest','Find Better Replacement','Compare Versions','Optimize Ticket','Clear','CORRELATION_REVIEW_REQUIRED','Cross-book analysis only','data-leg=','standalone_approved','eligible_legs'])need(betting.includes(x),`missing Build Your Own wiring ${x}`);
for(const x of ['MARKET_UNAVAILABLE','PASS','READY','WAITING_FOR_CURRENT_WEEK_OUTPUTS'])need(betting.includes(x),`missing controlled UI state ${x}`);
need(betting.includes("setInterval(load,60000)"),'score/feed browser refresh remains 60 seconds');
need(builder.includes('eligible_legs:eligibleLegs'),'final betting UI feed must expose only validated eligible legs');
need(builder.includes("standalone_approved===true")&&builder.includes("label==='PICK'"),'eligible legs must independently pass standalone PICK gate');
need(builder.includes("same_game_correlation_runtime:'BLOCK_UNTIL_VERIFIED_PAIR_CORRELATION_AVAILABLE'"),'same-game correlation blocking provenance missing');
need(index.includes('step5-controls-v1'),'index runtime cache key must point to Step 5 controls');
for(const forbidden of ['automatic_wagering": true','stake_sizing": true'])need(!JSON.stringify(contract).includes(forbidden),`forbidden authority ${forbidden}`);

const report={result:failures.length?'BLOCKED':'PASS',step:5,checks:29,failures};
console.log(JSON.stringify(report,null,2));
if(failures.length)process.exit(1);
