import fs from 'node:fs';
const input='data/probability/generated/historical-enriched-2021-2025.json';
if(!fs.existsSync(input))throw new Error('historical enriched data missing');
const data=JSON.parse(fs.readFileSync(input,'utf8'));const rows=data.rows||[];const POS=new Set(['QB','RB','WR','TE']);
const n=v=>Number.isFinite(Number(v))?Number(v):0,avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const sd=a=>{if(a.length<2)return null;const m=avg(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1))};
const quant=(a,p)=>{const x=a.filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return null;const z=(x.length-1)*p,l=Math.floor(z),h=Math.ceil(z);return l===h?x[l]:x[l]+(x[h]-x[l])*(z-l)};
const ppr=r=>r.position==='QB'?n(r.pass_yards)*.04+n(r.pass_tds)*4-n(r.interceptions)*2+n(r.rush_yards)*.1+n(r.rush_tds)*6:n(r.receptions)+n(r.receiving_yards)*.1+n(r.receiving_tds)*6+n(r.rush_yards)*.1+n(r.rush_tds)*6;
const active=r=>r.played!==false&&!r.inactive;
const byPS=new Map();for(const r of rows){if(!POS.has(r.position))continue;const k=`${r.player}|${r.season}`;if(!byPS.has(k))byPS.set(k,[]);byPS.get(k).push(r)}
const seasons=[];for(const [k,rs] of byPS){const [player,ys]=k.split('|'),season=Number(ys),ar=rs.filter(active);if(ar.length<4)continue;const pos=rs[0].position,vals=ar.map(ppr);seasons.push({player,season,position:pos,games:ar.length,ppg:avg(vals),weekly_sd:sd(vals)});}
const byKey=new Map(seasons.map(x=>[`${x.player}|${x.season}`,x]));const ex=[];
for(const cur of seasons){if(cur.season<2022||cur.games<6)continue;const prior=byKey.get(`${cur.player}|${cur.season-1}`);if(!prior||prior.games<4)continue;ex.push({player:cur.player,position:cur.position,season:cur.season,mu:prior.ppg,scale:Math.max(1,prior.weekly_sd||1),y:cur.ppg,resid:cur.ppg-prior.ppg});}
if(ex.length<250)throw new Error(`too few player-season examples ${ex.length}`);
const qv=[.1,.5,.9];
function bounds(train,pos){const pp=train.filter(x=>x.position===pos).map(x=>x.mu);return [quant(pp,1/3),quant(pp,2/3)]}
function tier(x,b){return x.mu<=b[0]?'LOW':x.mu<=b[1]?'MID':'HIGH'}
function pred(method,train,x){const pos=train.filter(z=>z.position===x.position);if(pos.length<20)return null;let pool=pos,scale=1;
 if(method==='POSITION_TIER_EMPIRICAL'||method==='POSITION_TIER_SCALED'){const b=bounds(train,x.position),t=tier(x,b);const p=pos.filter(z=>tier(z,b)===t);if(p.length>=15)pool=p;}
 if(method==='POSITION_SCALED'||method==='POSITION_TIER_SCALED'){const zs=pool.map(z=>z.resid/z.scale);scale=x.scale;return Object.fromEntries(qv.map(q=>[`q${q*100}`,x.mu+quant(zs,q)*scale]));}
 return Object.fromEntries(qv.map(q=>[`q${q*100}`,x.mu+quant(pool.map(z=>z.resid),q)]));}
const methods=['POSITION_EMPIRICAL','POSITION_TIER_EMPIRICAL','POSITION_SCALED','POSITION_TIER_SCALED'];
const rec={};for(const m of methods)rec[m]=[];
for(const target of [2023,2024,2025]){const train=ex.filter(x=>x.season<target),test=ex.filter(x=>x.season===target);for(const m of methods)for(const x of test){const p=pred(m,train,x);if(p)rec[m].push({...x,target,p});}}
function compatible(obs,p,N){const se=Math.sqrt(p*(1-p)/N);return Math.abs(obs-p)<=1.96*se}
function summarize(arr){const N=arr.length,c={};for(const q of qv){const k=`q${q*100}`,obs=arr.filter(x=>x.y<=x.p[k]).length/N;c[k]={coverage:obs,target:q,compatible_95pct:compatible(obs,q,N),absolute_error:Math.abs(obs-q)};}const central=arr.filter(x=>x.y>=x.p.q10&&x.y<=x.p.q90).length/N;c.central80={coverage:central,target:.8,compatible_95pct:compatible(central,.8,N),absolute_error:Math.abs(central-.8)};return {n:N,...c,mean_abs_calibration_error:avg([c.q10.absolute_error,c.q50.absolute_error,c.q90.absolute_error,c.central80.absolute_error])};}
const results={};for(const m of methods){const all=rec[m];const overall=summarize(all),by_position={};for(const p of POS){const a=all.filter(x=>x.position===p);if(a.length>=20)by_position[p]=summarize(a);}const overallPass=['q10','q50','q90','central80'].every(k=>overall[k].compatible_95pct);const posPass=Object.values(by_position).every(s=>s.central80.compatible_95pct);results[m]={overall,by_position,passes_statistical_coverage:overallPass&&posPass};}
const ranked=methods.map(m=>({method:m,score:results[m].overall.mean_abs_calibration_error,pass:results[m].passes_statistical_coverage})).sort((a,b)=>a.score-b.score);const winner=ranked.find(x=>x.pass)||null;
const report={generated_at:new Date().toISOString(),step:'STEP3B_DISTRIBUTION_ALTERNATIVES',status:winner?'CANDIDATE_PASSED_REQUIRES_REVIEW':'NO_CANDIDATE_PASSED_CONTINUE_TESTING',history_window:[2021,2022,2023,2024,2025],evaluation_targets:[2023,2024,2025],examples:ex.length,methods,coverage_rule:'Observed Q10/Q50/Q90 and central-80 coverage must be statistically compatible with nominal coverage at 95% under held-out walk-forward evaluation; each position central-80 must also be compatible.',results,ranking:ranked,winner:winner?.method||null,sportsbook_or_adp_used:false,live_weight:0,live_projection_movement:0,live_rank_movement:0,promotion_allowed:false};fs.mkdirSync('guardrails',{recursive:true});fs.writeFileSync('guardrails/step3b-distribution-alternatives.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,winner:report.winner,ranking:ranked,overall:Object.fromEntries(methods.map(m=>[m,results[m].overall]))},null,2));