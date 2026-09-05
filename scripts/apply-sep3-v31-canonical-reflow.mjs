import fs from 'node:fs';
import {execSync} from 'node:child_process';
const R=p=>JSON.parse(fs.readFileSync(p,'utf8'));const W=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n');
const INPUT='analysis/material-hold-canonical-apply-input-2026-09-05.json';
const QA='analysis/material-hold-canonical-apply-qa-2026-09-05.json';
const TARGET_STATUS='authoritative_current_2026_09_05_material_hold_recalibrated';
const weights={pd:.35,ce:.20,r:.15,e:.10,a:.10,rl:.05,su:.05};
const rd=(x,n=6)=>+Number(x).toFixed(n);const approx=(a,b,eps=1e-6)=>Math.abs(+a-+b)<=eps;
if(!fs.existsSync(INPUT))throw Error('material-hold calibration input missing');
const src=R('MODEL_SOURCE_OF_TRUTH.json'),inp=R(INPUT),patch=R(src.current_update_layer);
if(inp.approval!=='USER_APPROVED_MATERIAL_HOLD_CALIBRATION'||inp.universe!==src.active_player_model||inp.reviewed_holds!==19||inp.changed_players!==7||inp.rows.length!==7)throw Error('approval/input gate');
if(src.status===TARGET_STATUS&&fs.existsSync(QA)){
  const q=R(QA);if(q.players===src.active_player_model&&q.changed===7&&q.reviewed_holds===19&&q.errors?.length===0&&q.overall_unchanged&&q.market_unchanged&&q.projections_unchanged){console.log(JSON.stringify({result:'ALREADY_APPLIED',players:q.players,changed:q.changed,reviewed_holds:q.reviewed_holds},null,2));process.exit(0)}
}
let shards=[],players=[];for(let i=0;i<src.runtime_player_shards;i++){const f=`players${i}.json`,a=R(f);shards.push([f,a]);players.push(...a)}
if(players.length!==src.active_player_model||new Set(players.map(p=>p.n)).size!==players.length)throw Error('universe mismatch');
const by=new Map(players.map(p=>[p.n,p]));for(const p of players)Object.assign(p,patch.players?.[p.n]||{});
const snap=p=>({o:p.o,tr:p.tr,s:+p.s,pd:+p.pd,ce:+p.ce,r:+p.r,e:+p.e,a:+p.a,rl:+p.rl,su:+p.su,mp:p.mp,px:p.px,ad:p.ad,fw:p.fw});
const old=Object.fromEntries(players.map(p=>[p.n,snap(p)]));const inputBy=new Map(inp.rows.map(x=>[x.player,x]));
const errs=[];
for(const n of inp.zero_delta_resolutions){if(!by.has(n))errs.push(`missing zero-delta player ${n}`)}
for(const x of inp.rows){
  const p=by.get(x.player);if(!p){errs.push(`missing ${x.player}`);continue}
  if(!approx(+p.s,+x.expected_current_score,1e-5)){errs.push(`stale score ${x.player} expected ${x.expected_current_score} got ${p.s}`);continue}
  let calc=0;
  for(const[k,target]of Object.entries(x.component_targets)){
    if(!(k in weights)||!Number.isFinite(+p[k])||!Number.isFinite(+target)){errs.push(`bad component ${x.player} ${k}`);continue}
    calc+=(+target-+p[k])*weights[k];p[k]=rd(target,3);
  }
  calc=rd(calc,6);if(!approx(calc,+x.score_delta,1e-6))errs.push(`delta math ${x.player} expected ${x.score_delta} got ${calc}`);
  p.s=rd(old[x.player].s+calc,6);
  p.ns='2026-09-05 MATERIAL HOLD QUANTITATIVE RECALIBRATION';p.nm=x.reason;p.na=`Evidence-gated component delta ${calc>=0?'+':''}${calc}; True Value reflow only. Overall rank, projections and market labels preserved pending separate actionability/market review.`;
}
if(errs.length)throw Error(errs.join('; '));
// Incremental True-Value reflow only where the new score crosses an existing score. Preserve pre-existing calibrated ordering otherwise.
let tv=[...players].sort((a,b)=>old[a.n].tr-old[b.n].tr);
for(const x of [...inp.rows].sort((a,b)=>Math.abs(b.score_delta)-Math.abs(a.score_delta))){let i=tv.findIndex(p=>p.n===x.player),p=tv[i],base=old[p.n].s,neu=+p.s;if(neu>base){while(i>0){const q=tv[i-1],qs=+q.s;if(!(qs>base&&qs<=neu))break;tv.splice(i,1);tv.splice(i-1,0,p);i--}}else if(neu<base){while(i<tv.length-1){const q=tv[i+1],qs=+q.s;if(!(qs<base&&qs>=neu))break;tv.splice(i,1);tv.splice(i+1,0,p);i++}}}
let pc={};tv.forEach((p,i)=>{p.tr=i+1;pc[p.p]=(pc[p.p]||0)+1;p.tp=`${p.p}${pc[p.p]}`});
// Overall/actionable board is intentionally preserved in this calibration pass.
const ov=[...players].sort((a,b)=>old[a.n].o-old[b.n].o);pc={};ov.forEach((p,i)=>{if(p.o!==old[p.n].o)errs.push(`unexpected overall mutation ${p.n}`);pc[p.p]=(pc[p.p]||0)+1;p.pr=`${p.p}${pc[p.p]}`});
patch.updated=inp.as_of;patch.model='single 166-player active board — Sep 5 material-hold recalibrated';patch.step3e_status='PRESERVED_WITH_SEP5_MATERIAL_HOLD_RECALIBRATION';for(const p of players)patch.players[p.n]={...(patch.players[p.n]||{}),...p};W(src.current_update_layer,patch);
for(const [f,a] of shards)W(f,a.map(base=>by.get(base.n)));
const keep=['n','p','t','o','pr','tr','tp','s','pd','ce','r','e','a','rl','su','mp','m','cl','px','fw','st','ns','nm','na','en','ad','cp','cn','vl','vs','vr','market_as_of','market_read_override'];const slim=p=>Object.fromEntries(keep.filter(k=>k in p).map(k=>[k,p[k]]));
const canonical={updated:inp.as_of,active_players:players.length,weights:{'Expected Production':.35,'Ceiling':.20,'Role/Volume':.15,'Offensive Environment':.10,'Availability':.10,'Weekly Reliability':.05,'Sustainability':.05},overall:[...players].sort((a,b)=>a.o-b.o).map(slim),trueValue:[...players].sort((a,b)=>a.tr-b.tr).map(slim),positions:{}};for(const pos of ['QB','RB','WR','TE'])canonical.positions[pos]=[...players].filter(p=>p.p===pos).sort((a,b)=>a.tr-b.tr).map(slim);W('canonicalBoards2026.json',canonical);
src.status=TARGET_STATUS;src.effective_date=inp.as_of;src.current_update_layer_effective_date=inp.as_of;src.governance_note='Sep 5 material-hold quantitative recalibration: 19 holds resolved; 7 evidence-supported component changes applied with incremental True-Value reflow; 12 zero-delta resolutions; Overall/actionable ranks, projections and market labels intentionally preserved for separate downstream review.';W('MODEL_SOURCE_OF_TRUTH.json',src);
const ranks=a=>a.slice().sort((x,y)=>x-y).every((v,i)=>v===i+1);if(!ranks(players.map(p=>p.o)))errs.push('overall ranks');if(!ranks(players.map(p=>p.tr)))errs.push('tv ranks');
for(const p of players){if(old[p.n].o!==p.o)errs.push(`overall changed ${p.n}`);if(old[p.n].mp!==p.mp)errs.push(`projection changed ${p.n}`);if(old[p.n].px!==p.px)errs.push(`market changed ${p.n}`);if(old[p.n].ad!==p.ad)errs.push(`adp changed ${p.n}`);if(old[p.n].fw!==p.fw)errs.push(`fair window changed ${p.n}`)}
for(const n of inp.zero_delta_resolutions){const p=by.get(n),o=old[n];if(!approx(p.s,o.s)||p.pd!==o.pd||p.ce!==o.ce||p.r!==o.r||p.e!==o.e||p.a!==o.a||p.rl!==o.rl||p.su!==o.su)errs.push(`zero-delta mutation ${n}`)}
for(const x of inp.rows){const p=by.get(x.player),o=old[x.player];if(!approx(rd(p.s-o.s,6),rd(x.score_delta,6)))errs.push(`score delta ${x.player}`);for(const[k,v]of Object.entries(x.component_targets))if(!approx(+p[k],+v))errs.push(`component target ${x.player} ${k}`)}
const report={as_of:inp.as_of,source_pr:inp.source_pr,source_merge:inp.source_merge,players:players.length,reviewed_holds:inp.reviewed_holds,changed:inp.rows.length,zero_delta:inp.zero_delta_resolutions.length,overall_unchanged:players.every(p=>old[p.n].o===p.o),market_unchanged:players.every(p=>old[p.n].px===p.px&&old[p.n].ad===p.ad&&old[p.n].fw===p.fw),projections_unchanged:players.every(p=>old[p.n].mp===p.mp),overall_unique:ranks(players.map(p=>p.o)),true_value_unique:ranks(players.map(p=>p.tr)),errors:errs,changes:inp.rows.map(x=>{const p=by.get(x.player),o=old[x.player];return{player:x.player,score:`${o.s}->${p.s}`,tv:`${o.tr}->${p.tr}`,overall:p.o,market:p.px,components:Object.fromEntries(Object.keys(x.component_targets).map(k=>[k,`${o[k]}->${p[k]}`]))}})};W(QA,report);if(errs.length)throw Error(errs.join('; '));
console.log(JSON.stringify({result:'PASS',reviewed_holds:19,changed:7,zero_delta:12,overall_unchanged:true,market_unchanged:true,projections_unchanged:true,changes:report.changes},null,2));
// This legacy PR workflow only stages its Sep-3 declaration files later, so commit the Sep-5 canonical outputs here when running in Actions.
if(process.env.GITHUB_ACTIONS==='true'){
  execSync('git config user.name github-actions[bot]');execSync('git config user.email 41898282+github-actions[bot]@users.noreply.github.com');
  execSync(`git add MODEL_SOURCE_OF_TRUTH.json canonicalBoards2026.json ${src.current_update_layer} players*.json ${QA}`);
  try{execSync('git diff --cached --quiet')}catch{execSync("git commit -m 'Apply Sep 5 material-hold quantitative recalibration'");execSync(`git push origin HEAD:${process.env.GITHUB_HEAD_REF||process.env.GITHUB_REF_NAME}`)}
}
