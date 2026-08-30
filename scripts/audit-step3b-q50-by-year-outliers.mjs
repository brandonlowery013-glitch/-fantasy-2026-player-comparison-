import fs from 'node:fs';
const input='data/probability/generated/historical-reference-population-2021-2025.json';
if(!fs.existsSync(input)) throw new Error('broad historical reference missing');
const data=JSON.parse(fs.readFileSync(input,'utf8'));
const rows=data.rows||[], POS=['QB','RB','WR','TE'];
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
function q(a,p){const x=a.filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return null;const z=(x.length-1)*p,l=Math.floor(z),h=Math.ceil(z);return l===h?x[l]:x[l]+(x[h]-x[l])*(z-l)}
const ppr=r=>r.position==='QB'?n(r.pass_yards)*.04+n(r.pass_tds)*4-n(r.interceptions)*2+n(r.rush_yards)*.1+n(r.rush_tds)*6:n(r.receptions)+n(r.receiving_yards)*.1+n(r.receiving_tds)*6+n(r.rush_yards)*.1+n(r.rush_tds)*6;
const byPS=new Map();
for(const r of rows){if(!POS.includes(r.position))continue;const k=`${r.player_id}|${r.season}`;if(!byPS.has(k))byPS.set(k,[]);byPS.get(k).push(r)}
const ss=[];
for(const [k,rs] of byPS){const [id,ys]=k.split('|'),season=+ys;if(rs.length<4)continue;ss.push({id,player:rs[0].player,season,position:rs[0].position,games:rs.length,ppg:avg(rs.map(ppr))});}
const map=new Map(ss.map(x=>[`${x.id}|${x.season}`,x]));
const ex=[];
for(const cur of ss){if(cur.season<2022||cur.games<6)continue;const pr=map.get(`${cur.id}|${cur.season-1}`);if(!pr||pr.games<4)continue;ex.push({id:cur.id,player:cur.player,position:cur.position,season:cur.season,games:cur.games,prior_games:pr.games,mu:pr.ppg,y:cur.ppg,resid:cur.ppg-pr.ppg});}
function base(train,x){const p=train.filter(z=>z.position===x.position);if(p.length<20)return null;return {q10:x.mu+q(p.map(z=>z.resid),.1),q50:x.mu+q(p.map(z=>z.resid),.5),q90:x.mu+q(p.map(z=>z.resid),.9)};}
function fold(target){const calYear=target-1,baseTrain=ex.filter(x=>x.season<calYear),cal=ex.filter(x=>x.season===calYear),test=ex.filter(x=>x.season===target),corr={};for(const pos of POS){corr[pos]={};const cp=cal.filter(x=>x.position===pos);for(const [k,qq] of [['q10',.1],['q50',.5],['q90',.9]]){const ds=[];for(const x of cp){const p=base(baseTrain,x);if(p)ds.push(x.y-p[k]);}if(ds.length<10)throw new Error(`calibration sample too small ${target} ${pos} ${ds.length}`);corr[pos][k]=q(ds,qq);}}const out=[];for(const x of test){const p=base(ex.filter(z=>z.season<target),x);if(!p)continue;for(const k of ['q10','q50','q90'])p[k]+=corr[x.position][k];out.push({...x,target,q10:p.q10,q50:p.q50,q90:p.q90,q50_gap:x.y-p.q50,at_or_below_q50:x.y<=p.q50});}return out;}
const rec=[...fold(2024),...fold(2025)];
const summarize=a=>({n:a.length,q50_coverage:a.length?a.filter(x=>x.at_or_below_q50).length/a.length:null,mean_q50_gap:avg(a.map(x=>x.q50_gap)),median_q50_gap:q(a.map(x=>x.q50_gap),.5)});
const by_year_position={};
for(const yr of [2024,2025]){by_year_position[yr]={};for(const pos of POS)by_year_position[yr][pos]=summarize(rec.filter(x=>x.target===yr&&x.position===pos));}
const focus=rec.filter(x=>x.position==='QB'||x.position==='RB');
const biggest_positive=[...focus].sort((a,b)=>b.q50_gap-a.q50_gap).slice(0,15).map(x=>({player:x.player,position:x.position,season:x.target,games:x.games,actual_ppg:x.y,projected_q50:x.q50,q50_gap:x.q50_gap}));
const biggest_negative=[...focus].sort((a,b)=>a.q50_gap-b.q50_gap).slice(0,15).map(x=>({player:x.player,position:x.position,season:x.target,games:x.games,actual_ppg:x.y,projected_q50:x.q50,q50_gap:x.q50_gap}));
const report={generated_at:new Date().toISOString(),step:'STEP3B_Q50_YEAR_OUTLIER_AUDIT',method:'CONFORMAL_POSITION',evaluation_targets:[2024,2025],heldout_predictions:rec.length,by_year_position,biggest_positive_q50_misses:biggest_positive,biggest_negative_q50_misses:biggest_negative,sportsbook_or_adp_used:false,live_weight:0,live_projection_movement:0,live_rank_movement:0,promotion_allowed:false};
fs.mkdirSync('guardrails',{recursive:true});fs.writeFileSync('guardrails/step3b-q50-year-outlier-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
