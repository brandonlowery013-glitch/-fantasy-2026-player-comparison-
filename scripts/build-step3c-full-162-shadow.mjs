import fs from 'node:fs';

const DECISION='data/sources/step3b-final-decision-2026.json';
const decision=JSON.parse(fs.readFileSync(DECISION,'utf8'));
if(decision.version!=='STEP3B_FINAL_DECISION_2.1.0') throw new Error(`Expected Step3B 2.1.0; found ${decision.version}`);
if(decision.status!=='STEP3B_FOUNDATION_LOCKED_AWAITING_USER_APPROVAL_FOR_3C') throw new Error(`Step3B not locked: ${decision.status}`);
if(decision.sportsbook_or_adp_used!==false) throw new Error('Step3C refuses a market-contaminated Step3B contract');

const universeCfg=JSON.parse(fs.readFileSync('guardrails/guardrails-config.json','utf8'));
const expectedPlayerCount=Number(universeCfg.authoritative_player_count);
const shardFiles=fs.readdirSync('.').filter(f=>/^players\d+\.json$/.test(f)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
const players=shardFiles.flatMap(f=>JSON.parse(fs.readFileSync(f,'utf8')));
if(players.length!==expectedPlayerCount) throw new Error(`Step3C requires exactly ${expectedPlayerCount} players; found ${players.length}`);
if(new Set(players.map(p=>p.n)).size!==expectedPlayerCount) throw new Error(`Step3C requires ${expectedPlayerCount} unique names`);

const histDoc=JSON.parse(fs.readFileSync('historicalStats2026.json','utf8'));
const hist=histDoc.players||{};
const aliasDoc=fs.existsSync('history-alias-reconciliation-audit.json')?JSON.parse(fs.readFileSync('history-alias-reconciliation-audit.json','utf8')):{};
const activeToHistorical=Object.fromEntries((aliasDoc.aliases_in_historical_file||[]).map(x=>[x.active,x.historical]));
const noHistorySet=new Set(decision.rookie_history_integrity.shadow_no_history_players||[]);
const contaminatedSet=new Set(decision.rookie_history_integrity.known_persistent_source_contamination_players||[]);

const num=v=>{if(v==null)return 0;const n=Number(String(v).replace(/,/g,'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
const get=(r,ks)=>{for(const k of ks)if(r?.[k]!=null)return num(r[k]);return 0};
const gp=r=>get(r,['Games','GP','G'])||17;
const med=a=>{const x=a.filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return null;const m=(x.length-1)/2,l=Math.floor(m),h=Math.ceil(m);return l===h?x[l]:(x[l]+x[h])/2};

function ppr(row,pos){
  if(pos==='QB') return get(row,['Pass Yards','PassYds'])*.04+get(row,['Pass TD','PassTD'])*4-get(row,['INT'])*2+get(row,['Rush Yards','Rush Yds','RushYds'])*.1+get(row,['Rush TD','RushTD'])*6;
  return get(row,['Receptions','Rec','Rec.'])+get(row,['Receiving Yards','Rec Yds','RecYds','Rec. Yards'])*.1+get(row,['TD','Rec TD','RecTD','Rec. TD'])*6+get(row,['Rush Yards','Rush Yds','RushYds'])*.1+get(row,['Rush TD','RushTD'])*6;
}
function historyKey(p){
  if(noHistorySet.has(p.n)) return null;
  if(hist[p.n]) return p.n;
  const a=activeToHistorical[p.n];
  return a&&hist[a]?a:null;
}
function rowsFor(p){
  const k=historyKey(p); if(!k)return [];
  return (hist[k]||[]).slice().sort((a,b)=>Number(a.Season||a.Year||0)-Number(b.Season||b.Year||0)).slice(-3);
}
function seasonPpg(row,pos){const pts=ppr(row,pos);return pts>0?pts/Math.max(1,gp(row)):null;}
function recencyHistoryPpg(p){
  const rows=rowsFor(p); if(!rows.length)return null;
  const weights=rows.length===1?[1]:rows.length===2?[.35,.65]:[.2,.3,.5];
  let s=0,w=0;
  rows.forEach((r,i)=>{const x=seasonPpg(r,p.p);if(Number.isFinite(x)){s+=x*weights[i];w+=weights[i];}});
  return w?s/w:null;
}

function parseCsv(t){const rs=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'&&t[i+1]==='"'){f+='"';i++;}else if(c==='"')q=false;else f+=c;}else{if(c==='"')q=true;else if(c===','){row.push(f);f='';}else if(c==='\n'){row.push(f.replace(/\r$/,''));rs.push(row);row=[];f='';}else f+=c;}}if(f.length||row.length){row.push(f);rs.push(row)}const h=rs.shift()||[];return rs.filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))}
async function qbTrailing2Correction(){
  const seasonRows=[];
  for(const season of [2023,2024,2025]){
    const u=`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`;
    const r=await fetch(u,{headers:{'user-agent':'fantasy-2026-step3c-shadow'}});
    if(!r.ok)throw new Error(`QB residual source failed ${r.status}: ${u}`);
    const rows=parseCsv(await r.text()).filter(x=>String(x.season_type||'REG').toUpperCase()==='REG'&&String(x.position||'').toUpperCase()==='QB');
    const by=new Map();
    for(const x of rows){const id=x.player_id||x.gsis_id;if(!id)continue;const fp=num(x.passing_yards)*.04+num(x.passing_tds)*4-num(x.interceptions)*2+num(x.rushing_yards)*.1+num(x.rushing_tds)*6;const k=String(id);if(!by.has(k))by.set(k,[]);by.get(k).push(fp);}
    for(const [id,fp] of by)if(fp.length>=4)seasonRows.push({id,season,games:fp.length,ppg:fp.reduce((a,b)=>a+b,0)/fp.length});
  }
  const map=new Map(seasonRows.map(x=>[`${x.id}|${x.season}`,x]));
  const residuals=[];
  for(const cur of seasonRows.filter(x=>x.season===2024||x.season===2025)){
    if(cur.games<6)continue;const pr=map.get(`${cur.id}|${cur.season-1}`);if(!pr||pr.games<4)continue;residuals.push(cur.ppg-pr.ppg);
  }
  if(residuals.length<20) throw new Error(`TRAILING_2 residual pool unexpectedly small: ${residuals.length}`);
  return {median:med(residuals),n:residuals.length};
}

const qbCorrection=await qbTrailing2Correction();
const anchors={QB:[[170,6],[200,7],[230,7.7],[260,8.3],[290,8.8],[320,9.3],[380,10]],RB:[[130,6],[160,7],[190,7.7],[220,8.3],[250,8.8],[280,9.3],[340,10]],WR:[[135,6],[165,7],[195,7.7],[225,8.3],[255,8.8],[290,9.3],[350,10]],TE:[[100,6],[125,7],[150,7.7],[175,8.3],[205,8.8],[235,9.3],[290,10]]};
function interp(pos,x){const a=anchors[pos]||anchors.WR;if(x<=a[0][0])return a[0][1];if(x>=a.at(-1)[0])return a.at(-1)[1];for(let i=0;i<a.length-1;i++){const [x0,y0]=a[i],[x1,y1]=a[i+1];if(x>=x0&&x<=x1)return Math.round((y0+(x-x0)*(y1-y0)/(x1-x0))*1000)/1000;}return 7;}
const tv=(p,pd)=>Math.round((pd*.35+Number(p.ce)*.20+Number(p.r)*.15+Number(p.e)*.10+Number(p.a)*.10+Number(p.rl)*.05+Number(p.su)*.05)*1000)/1000;
const threshold=Number(decision.extreme_disagreement.threshold_ppg);
const rows=[];

for(const p of players){
  const live=Number(p.mp);
  if(!Number.isFinite(live))throw new Error(`Missing live projection for ${p.n}`);
  const hRows=rowsFor(p);
  const histPpg=recencyHistoryPpg(p);
  let shadowPpg=live/17;
  if(Number.isFinite(histPpg)) shadowPpg=0.72*shadowPpg+0.28*histPpg;
  if(p.p==='QB') shadowPpg+=qbCorrection.median;
  const shadowProjection=Math.round(shadowPpg*17*100)/100;
  const shadowPd=interp(p.p,shadowProjection);
  const shadowTv=tv(p,shadowPd);
  const gapPpg=shadowPpg-live/17;
  const review=Math.abs(gapPpg)>=threshold;
  rows.push({player:p.n,position:p.p,live_projection:live,shadow_projection:shadowProjection,live_ppr_per_game:live/17,shadow_ppr_per_game:shadowPpg,shadow_expected_production:shadowPd,shadow_true_value:shadowTv,history_seasons:hRows.map(r=>Number(r.Season||r.Year||0)),history_key:historyKey(p),rookie_no_history:noHistorySet.has(p.n),persistent_history_contamination:contaminatedSet.has(p.n),extreme_disagreement_review_required:review});
}

const out={
  generated_at:new Date().toISOString(),
  step:'STEP_3C_FULL_SHADOW_RECALCULATION',
  universe_count:players.length,
  authoritative_player_count:expectedPlayerCount,
  status:'SHADOW_ONLY_AWAITING_STEP3D_REVIEW',
  live_change_authority:0,
  sportsbook_or_adp_used:false,
  qb_q50_correction:{method:'TRAILING_2',median_residual_ppg:qbCorrection.median,n:qbCorrection.n},
  extreme_disagreement_threshold_ppg:threshold,
  extreme_review_count:rows.filter(x=>x.extreme_disagreement_review_required).length,
  rows
};
fs.writeFileSync('guardrails/step3c-shadow-recalculation-162.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({result:'PASS',players:players.length,extreme_review_count:out.extreme_review_count,status:out.status},null,2));
