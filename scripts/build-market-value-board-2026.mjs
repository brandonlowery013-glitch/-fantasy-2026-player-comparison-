import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,x)=>{fs.mkdirSync(p.split('/').slice(0,-1).join('/'),{recursive:true});fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n');};
const src=read('data/market/draft-edge-opportunity-screen-166.json');
if(src.universe!==166||src.authority!=='COMPANION_ONLY_NO_INTRINSIC_RANK_MUTATION')throw Error('Step 2 source contract invalid');
const n=v=>Number.isFinite(Number(v))?Number(v):0;
function canonical(r){
  if(r.price_status!=='AVAILABLE') return {action:'PRICE PENDING',subtype:'PRICE PENDING'};
  if(r.read==='FADE') return {action:'FADE',subtype:'HIGH DOWNSIDE'};
  if(r.read==='REACH') {
    const severe=n(r.bust_downside)>=7.5 && n(r.price_edge)<=-8;
    return {action:severe?'FADE':'REACH',subtype:severe?'PREMIUM + DOWNSIDE':'MARKET PREMIUM'};
  }
  if(r.read==='BUY') return {action:'BUY',subtype:'BUY'};
  if(r.read==='SLEEPER') return {action:'BUY',subtype:'SLEEPER'};
  if(r.read==='CONDITIONAL BUY') return {action:'BUY',subtype:'CONDITIONAL BUY'};
  if(r.read==='DEEP STASH') return {action:'FAIR',subtype:'DEEP STASH'};
  if(r.read==='VALUE WATCH') {
    const promote=n(r.multi_edge_strength)>=2 && n(r.price_edge)>=12 && n(r.opportunity_score)>=6.5;
    return {action:promote?'BUY':'FAIR',subtype:promote?'MULTI-EDGE BUY':'VALUE WATCH'};
  }
  return {action:'FAIR',subtype:'FAIR'};
}
function conflict(r){
  const vals=[r.price_edge,r.projection_edge,r.ceiling_edge,r.role_edge].filter(v=>v!=null).map(Number);
  const pos=vals.filter(v=>v>=8).length, neg=vals.filter(v=>v<=-8).length;
  if(pos&&neg)return 'MIXED';
  if(pos>=2)return 'POSITIVE CONSENSUS';
  if(neg>=2)return 'NEGATIVE CONSENSUS';
  return 'LOW/NO CONFLICT';
}
const rows=src.players.map(r=>{
  const c=canonical(r);
  const confidence=r.price_status!=='AVAILABLE'?'PENDING':n(r.multi_edge_strength)>=3?'HIGH':n(r.multi_edge_strength)>=2?'MEDIUM-HIGH':Math.abs(n(r.price_edge))>=15?'MEDIUM':'STANDARD';
  const priority=c.action==='BUY'?n(r.opportunity_score):c.action==='FADE'?10-n(r.opportunity_score):Math.abs(n(r.price_edge))/10;
  return {player:r.player,position:r.position,overall_rank:r.overall_rank,true_value_rank:r.true_value_rank,market_adp:r.market_adp,market_ecr:r.market_ecr,action:c.action,subtype:c.subtype,confidence,conflict:conflict(r),priority:Number(priority.toFixed(3)),price_edge:r.price_edge,projection_edge:r.projection_edge,ceiling_edge:r.ceiling_edge,role_edge:r.role_edge,positional_edge:r.positional_edge,bust_downside:r.bust_downside,opportunity_score:r.opportunity_score,signals:r.signals};
});
const counts={};for(const r of rows)counts[r.action]=(counts[r.action]||0)+1;
const sortBuy=(a,b)=>b.priority-a.priority||b.confidence.localeCompare(a.confidence)||a.overall_rank-b.overall_rank;
const sortFade=(a,b)=>b.bust_downside-a.bust_downside||a.price_edge-b.price_edge||a.overall_rank-b.overall_rank;
const board={as_of:'2026-08-31',season:2026,status:'STEP_3_MARKET_DISCREPANCY_VALUE_BOARD',authority:'COMPANION_ONLY_NO_INTRINSIC_RANK_MUTATION',universe:166,source:'data/market/draft-edge-opportunity-screen-166.json',market_source:src.market_source,market_as_of:src.market_as_of,price_coverage:src.price_coverage,counts,rules:{top_level:'BUY / FAIR / REACH / FADE; PRICE PENDING is never force-classified',sleepers:'SLEEPER and CONDITIONAL BUY roll into BUY as subtypes',deep_stash:'DEEP STASH rolls into FAIR because it is not an active draft target at normal roster depth',value_watch:'VALUE WATCH promotes to BUY only with multi-edge confirmation, >=12 spots of price edge, and opportunity score >=6.5',fade:'REACH escalates to FADE only when market premium and downside risk are both severe',authority:'market layer cannot independently mutate True Value, Overall rank, projections, or player-quality scores'},price_pending:rows.filter(r=>r.action==='PRICE PENDING').map(r=>r.player),top_buys:rows.filter(r=>r.action==='BUY').sort(sortBuy).slice(0,25),top_fades:rows.filter(r=>r.action==='FADE').sort(sortFade).slice(0,25),top_reaches:rows.filter(r=>r.action==='REACH').sort((a,b)=>a.price_edge-b.price_edge||b.bust_downside-a.bust_downside).slice(0,25),board:rows.sort((a,b)=>a.overall_rank-b.overall_rank)};
if(board.board.length!==166||new Set(board.board.map(x=>x.player)).size!==166)throw Error('Step 3 universe coverage failed');
if(board.price_pending.length!==10)throw Error(`Expected 10 price-pending players, got ${board.price_pending.length}`);
write('data/market/market-value-board-2026.json',board);
console.log(JSON.stringify({result:'PASS',counts,top_buys:board.top_buys.slice(0,10).map(x=>[x.player,x.subtype,x.priority]),top_fades:board.top_fades.slice(0,10).map(x=>[x.player,x.subtype,x.bust_downside]),price_pending:board.price_pending},null,2));
