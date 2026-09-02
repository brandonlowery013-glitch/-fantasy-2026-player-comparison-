import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');
const ledgerPath='guardrails/current-football-review.json';
const summaryPath='guardrails/live-full-universe-review-summary.json';
const ledger=read(ledgerPath);
const source=read('MODEL_SOURCE_OF_TRUTH.json');
const active=[];for(let i=0;i<Number(source.runtime_player_shards);i++)active.push(...read(`players${i}.json`));
const textNorm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const surnameCounts=new Map();for(const p of active){const last=textNorm(p.n).split(' ').filter(Boolean).at(-1);if(last)surnameCounts.set(last,(surnameCounts.get(last)||0)+1);}
const materialRe=/\b(injur|injured|soreness|stiffness|pain|out|dnp|did not practice|didn t practice|ir|pup|nfi|exempt|suspend|trade|traded|waiv|release|released|cut|sign|signed|activate|activated|starter|starting|depth chart|practice|practiced|limited|questionable|doubtful|return|returned|role|workload|committee|timeshare|target|route|snap|carry|touch|reps|first team|goal line|red zone|rb1|wr1|te1|qb1)\b/i;
const now=Date.now(),maxAgeMs=14*24*60*60*1000;
function recent(m){if(!m?.published)return m?.source==='NFL.com';const t=Date.parse(m.published);return Number.isFinite(t)&&t<=now+24*60*60*1000&&now-t<=maxAgeMs;}
function localContext(player,m){
  const phrase=textNorm(player),header=textNorm(`${m?.headline||''} ${m?.description||''}`),body=textNorm(m?.body_text||'');
  if(phrase&&header.includes(phrase))return{context:header,match:'FULL_NAME_HEADER'};
  const words=body.split(' ').filter(Boolean),pwords=phrase.split(' ').filter(Boolean);
  if(pwords.length){for(let i=0;i<=words.length-pwords.length;i++){if(pwords.every((w,j)=>words[i+j]===w)){const a=Math.max(0,i-45),b=Math.min(words.length,i+pwords.length+45);return{context:words.slice(a,b).join(' '),match:'FULL_NAME_BODY_WINDOW'};}}}
  const last=pwords.at(-1);if(last&&last.length>=4&&(surnameCounts.get(last)||0)===1){const hi=header.split(' ');const idx=hi.indexOf(last);if(idx>=0)return{context:hi.slice(Math.max(0,idx-35),Math.min(hi.length,idx+36)).join(' '),match:'UNIQUE_SURNAME_HEADER'};for(let i=0;i<words.length;i++)if(words[i]===last)return{context:words.slice(Math.max(0,i-45),Math.min(words.length,i+46)).join(' '),match:'UNIQUE_SURNAME_BODY_WINDOW'};}
  if(m?.source==='ESPN_PLAYER')return{context:textNorm(`${m?.headline||''} ${m?.description||''}`),match:'BOUND_ESPN_PLAYER'};
  return{context:'',match:'NO_LOCAL_PLAYER_CONTEXT'};
}
function qualify(player,m){if(!recent(m))return null;const {context,match}=localContext(player,m);if(!context||!materialRe.test(context))return null;return{...m,match_evidence:match,matched_context:context};}
function dedupe(xs){const seen=new Set();return xs.filter(x=>{const k=x.url||`${x.source}|${x.headline}|${x.description}`;if(seen.has(k))return false;seen.add(k);return true;});}
let before=0,after=0;
for(const p of ledger.players||[]){before+=(p.material_news_signals||[]).length;const qualified=dedupe((p.news_mentions||[]).map(m=>qualify(p.player,m)).filter(Boolean));p.material_news_signals=qualified;after+=qualified.length;}
let connectedBefore=0,connectedAfter=0;
for(const p of ledger.materially_implicated_untracked||[]){connectedBefore+=(p.material_news_signals||[]).length;const qualified=dedupe((p.news_mentions||[]).map(m=>qualify(p.player,m)).filter(Boolean));p.material_news_signals=qualified;connectedAfter+=qualified.length;}
const trackedSignals=(ledger.players||[]).filter(p=>(p.material_news_signals||[]).length).map(p=>({player:p.player,team:null,mentions:p.material_news_signals}));
const connectedSignals=(ledger.materially_implicated_untracked||[]).filter(p=>(p.material_news_signals||[]).length).map(p=>({player:p.player,team:p.team||null,mentions:p.material_news_signals}));
if(trackedSignals.length>Math.ceil(Number(source.active_player_model)*0.65))throw new Error(`Materiality relevance failure: ${trackedSignals.length}/${source.active_player_model} modeled players still triggered after player-local current-context filtering`);
ledger.schema_version='1.2.1';ledger.materiality_filter={method:'PLAYER_LOCAL_CONTEXT_PLUS_14_DAY_FRESHNESS',material_mentions_before:before,material_mentions_after:after,tracked_players_triggered:trackedSignals.length,connected_mentions_before:connectedBefore,connected_mentions_after:connectedAfter,generated_at:new Date().toISOString()};
write(ledgerPath,ledger);
const old=fs.existsSync(path.join(root,summaryPath))?read(summaryPath):{};
const summary={...old,generated_at:new Date().toISOString(),tracked_reviewed:(ledger.players||[]).length,material_changes:(ledger.players||[]).filter(p=>p.status==='MATERIAL_CHANGE').map(p=>({player:p.player,reason:p.reason||null})),material_change_count:(ledger.players||[]).filter(p=>p.status==='MATERIAL_CHANGE').length,tracked_material_news_signals:trackedSignals,tracked_material_news_signal_count:trackedSignals.length,connected_material_news_signals:connectedSignals,connected_material_news_signal_count:connectedSignals.length,untracked_candidates:ledger.materially_implicated_untracked||[],untracked_candidate_count:(ledger.materially_implicated_untracked||[]).length,materiality_filter:ledger.materiality_filter,result:'BUILT'};
write(summaryPath,summary);
console.log(JSON.stringify({result:'PASS',tracked_players:(ledger.players||[]).length,tracked_material_players:trackedSignals.length,material_mentions_before:before,material_mentions_after:after,connected_material_players:connectedSignals.length,connected_mentions_before:connectedBefore,connected_mentions_after:connectedAfter,players:trackedSignals.map(x=>x.player)},null,2));
