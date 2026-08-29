import fs from 'node:fs';

const compare=fs.readFileSync('compare.html','utf8');
const ui=fs.readFileSync('runtime-comparison-ui-step3.js','utf8');
const decision=fs.readFileSync('runtime-comparison-decision-2026.js','utf8');
const fail=m=>{throw new Error(m)};
const need=(s,x,m)=>{if(!s.includes(x))fail(m)};

need(compare,'runtime-comparison-decision-2026.js','Step 6B decision runtime must remain loaded');
need(compare,'runtime-comparison-ui-step3.js','Step 3 UI runtime must be loaded');
need(ui,"labels[0].textContent='Better Player'",'Better Player label missing');
need(ui,"labels[1].textContent='Best Draft Value'",'Best Draft Value label missing');
need(ui,'Two separate decisions:','Decision-separation explainer missing');
need(ui,"chips[0].textContent='Football Edge'",'Football Edge chip missing');
need(ui,"chips[1].textContent='Price / ADP Edge'",'Price/ADP Edge chip missing');
need(ui,"dataset.uiStep3='comparison-results'",'Step 3 DOM marker missing');
need(ui,'@media(max-width:440px)','Narrow mobile comparison fallback missing');
need(decision,'usesDraftPrice:false','Better Player runtime must remain draft-price independent');
need(decision,'usesSportsbook:false','Better Player runtime must remain sportsbook independent');

for(const forbidden of ['p.pd*.35','americanProb(','priceClass(','vals=','vegasPanel(','fetch(']){
  if(ui.includes(forbidden))fail(`Presentation runtime contains forbidden model/data logic: ${forbidden}`);
}
console.log('UI Step 3 comparison QA PASS');