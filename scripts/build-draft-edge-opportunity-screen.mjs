import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,x)=>{fs.mkdirSync(p.split('/').slice(0,-1).join('/'),{recursive:true});fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n');};
const sot=read('MODEL_SOURCE_OF_TRUTH.json');
const patch=read(sot.current_update_layer);
const market=read('market2026.json');
const expected=Number(sot.active_player_model);
const players=Object.entries(patch.players||{}).map(([name,p])=>({name,...p}));
if(players.length!==expected)throw new Error(`Expected ${expected} players in authoritative overlay, found ${players.length}`);
if(new Set(players.map(x=>x.name)).size!==expected)throw new Error('Duplicate player names in authoritative overlay');

const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const round=(x,d=3)=>Number(Number(x).toFixed(d));
const rankBy=(arr,scoreFn)=>{const out=new Map();[...arr].sort((a,b)=>scoreFn(b)-scoreFn(a)||num(a.o,999)-num(b.o,999)||a.name.localeCompare(b.name)).forEach((p,i)=>out.set(p.name,i+1));return out;};
const projRank=rankBy(players,p=>num(p.mp));
const ceilingRank=rankBy(players,p=>num(p.ce));
const roleRank=rankBy(players,p=>num(p.r));
const scoreRank=rankBy(players,p=>num(p.s));

const aliases={"James Cook":"James Cook","Deebo Samuel":"Deebo Samuel","Isaiah Likely":"Isiah Likely"};
function marketRow(name){return market.players?.[name]||market.players?.[aliases[name]]||null;}
const byPos=new Map();
for(const p of players){if(!byPos.has(p.pr?.replace(/\d+$/,'')||p.p))byPos.set(p.pr?.replace(/\d+$/,'')||p.p,[]);byPos.get(p.pr?.replace(/\d+$/,'')||p.p).push(p);}
const marketPosRank=new Map();
for(const [pos,rows] of byPos){const priced=rows.map(p=>({p,m:marketRow(p.name)})).filter(x=>x.m&&Number.isFinite(Number(x.m.adp))).sort((a,b)=>Number(a.m.adp)-Number(b.m.adp));priced.forEach((x,i)=>marketPosRank.set(x.p.name,i+1));}

function label(row){
  if(row.price_status!=='AVAILABLE')return 'PRICE PENDING';
  const g=row.price_edge;
  if(row.bust_downside>=8 && g<=5)return 'FADE';
  if(g<=-18 || (row.bust_downside>=7 && g<0))return 'REACH';
  if(g>=25 && row.opportunity_score>=7.2)return 'BUY';
  if(g>=14 && row.opportunity_score>=6.2)return 'SLEEPER';
  if(g>=8)return 'VALUE WATCH';
  if(g<=-8)return 'REACH';
  return 'FAIR';
}
function topSignals(r){
  const s=[];
  if(r.price_status!=='AVAILABLE')s.push('price discovery pending');
  else if(r.price_edge>=20)s.push(`ADP discount +${r.price_edge}`); else if(r.price_edge<=-15)s.push(`ADP premium ${r.price_edge}`);
  if(r.projection_edge!=null&&r.projection_edge>=20)s.push('projection rank beats price');
  if(r.ceiling_edge!=null&&r.ceiling_edge>=20)s.push('ceiling rank beats price');
  if(r.role_edge!=null&&r.role_edge>=20)s.push('role rank beats price');
  if(r.bust_downside>=7)s.push('elevated downside');
  if(r.positional_edge!=null&&r.positional_edge>=4)s.push('positional discount');
  if(!s.length)s.push('model and market broadly aligned');
  return s.slice(0,3);
}

const rows=players.map(p=>{
  const m=marketRow(p.name), adp=m&&Number.isFinite(Number(m.adp))?Number(m.adp):null, ecr=m&&Number.isFinite(Number(m.ecr))?Number(m.ecr):null;
  const o=num(p.o), prj=projRank.get(p.name), cr=ceilingRank.get(p.name), rr=roleRank.get(p.name), sr=scoreRank.get(p.name);
  const priceEdge=adp==null?null:round(adp-o,1);
  const projectionEdge=adp==null?null:round(adp-prj,1);
  const ceilingEdge=adp==null?null:round(adp-cr,1);
  const roleEdge=adp==null?null:round(adp-rr,1);
  const modelPos=Number(String(p.pr||'').match(/\d+$/)?.[0]||0)||null;
  const mpr=marketPosRank.get(p.name)||null;
  const posEdge=(modelPos&&mpr)?round(mpr-modelPos,1):null;
  const intrinsicRisk=(10-num(p.a))*0.35+(10-num(p.rl))*0.25+(10-num(p.su))*0.20+(10-num(p.r))*0.10+(10-num(p.e))*0.10;
  const premiumRisk=priceEdge==null?0:clamp(-priceEdge/35,0,2.5);
  const bust=round(clamp(intrinsicRisk+premiumRisk,0,10),3);
  const posGap=x=>x==null?0:clamp(x/35,-2,2);
  const marketComposite=priceEdge==null?0:(posGap(priceEdge)*1.35+posGap(projectionEdge)*1.0+posGap(ceilingEdge)*0.85+posGap(roleEdge)*0.8+(posEdge==null?0:clamp(posEdge/8,-1,1)*0.5));
  const intrinsic=((num(p.pd)-5)*0.30+(num(p.ce)-5)*0.26+(num(p.r)-5)*0.22+(num(p.e)-5)*0.08+(num(p.a)-5)*0.05+(num(p.rl)-5)*0.05+(num(p.su)-5)*0.04);
  const opportunity=round(clamp(5+intrinsic*0.55+marketComposite-bust*0.22,0,10),3);
  const row={player:p.name,position:String(p.pr||'').replace(/\d+$/,'')||null,overall_rank:o,true_value_rank:num(p.tr),position_rank:p.pr||null,true_value_position_rank:p.tp||null,model_score:num(p.s),projected_ppr:num(p.mp),projection_rank:prj,ceiling_score:num(p.ce),ceiling_rank:cr,role_score:num(p.r),role_rank:rr,environment_score:num(p.e),availability:num(p.a),reliability:num(p.rl),sustainability:num(p.su),market_adp:adp,market_ecr:ecr,price_status:adp==null?'PENDING':'AVAILABLE',price_edge:priceEdge,projection_edge:projectionEdge,ceiling_edge:ceilingEdge,role_edge:roleEdge,positional_market_rank:mpr,positional_edge:posEdge,bust_downside:bust,opportunity_score:opportunity,score_rank:sr};
  row.read=label(row); row.signals=topSignals(row); return row;
});

const counts={};for(const r of rows)counts[r.read]=(counts[r.read]||0)+1;
const actionable=rows.filter(r=>!['FAIR'].includes(r.read)).sort((a,b)=>b.opportunity_score-a.opportunity_score||a.overall_rank-b.overall_rank);
const strongest_values=rows.filter(r=>['BUY','SLEEPER','VALUE WATCH'].includes(r.read)).sort((a,b)=>b.opportunity_score-a.opportunity_score||num(b.price_edge)-num(a.price_edge)).slice(0,20).map(r=>r.player);
const strongest_fades=rows.filter(r=>['FADE','REACH'].includes(r.read)).sort((a,b)=>b.bust_downside-a.bust_downside||num(a.price_edge)-num(b.price_edge)).slice(0,20).map(r=>r.player);
const price_pending=rows.filter(r=>r.price_status==='PENDING').map(r=>r.player);
const out={as_of:'2026-08-31',season:2026,universe:expected,status:'STEP_2_166_EDGE_OPPORTUNITY_SCREEN',authority:'COMPANION_ONLY_NO_INTRINSIC_RANK_MUTATION',market_source:market.source,market_as_of:market.as_of,price_coverage:`${expected-price_pending.length}/${expected}`,dimensions:{projection_edge:'market ADP minus rank by projected PPR; positive = model projection is cheaper than market price',price_edge:'market ADP minus Overall rank; positive = draft discount',ceiling_edge:'market ADP minus rank by ceiling score; positive = ceiling available later than model implies',bust_downside:'0-10 downside index from availability/reliability/sustainability/role/environment deficits plus market premium; does not mutate core model',role_edge:'market ADP minus rank by Role/Volume score; positive = role available at discount',positional_edge:'market positional ADP rank minus model positional rank; positive = positional discount'},counts,price_pending,strongest_values,strongest_fades,actionable,players:rows};
write('data/market/draft-edge-opportunity-screen-166.json',out);
console.log(JSON.stringify({result:'PASS',universe:rows.length,unique:new Set(rows.map(x=>x.player)).size,price_coverage:out.price_coverage,counts,price_pending,strongest_values:strongest_values.slice(0,10),strongest_fades:strongest_fades.slice(0,10)},null,2));
