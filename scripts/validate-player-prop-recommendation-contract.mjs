import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const c=read('data/sources/player-prop-recommendation-layer-2026.json'),g=read('data/sources/game-market-recommendation-layer-2026.json'),blocked=[];
if(c.season!==2026)blocked.push('season must be 2026');if(c.mode!=='SHADOW_ONLY'||c.actionable!==false)blocked.push('must remain SHADOW_ONLY/non-actionable');if(c.player_universe!==162)blocked.push('player universe must be 162');if(c.fair_market_method!=='PROPORTIONAL_TWO_WAY')blocked.push('fair market method drift');
for(const k of ['minimum_probability_edge','minimum_expected_value','minimum_model_conditional_win_probability'])if(Number(c.recommendation_policy?.[k])!==Number(g.recommendation_policy?.[k]))blocked.push(`recommendation threshold drift ${k}`);
for(const h of ['SEASON','WEEKLY'])if(!c.horizons?.includes(h))blocked.push(`missing horizon ${h}`);
const text=JSON.stringify(c.locked_rules||[]).toLowerCase();for(const phrase of ['162','de-vigged','push','close','mutate'])if(!text.includes(phrase))blocked.push(`locked rules missing ${phrase}`);
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});const report={generated_at:new Date().toISOString(),result:blocked.length?'BLOCKED':'PASS',mode:c.mode,actionable:c.actionable,player_universe:c.player_universe,horizons:c.horizons,fair_market_method:c.fair_market_method,recommendation_policy:c.recommendation_policy,blocked};fs.writeFileSync(path.join(root,'guardrails/player-prop-recommendation-contract-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(blocked.length)process.exit(1);
