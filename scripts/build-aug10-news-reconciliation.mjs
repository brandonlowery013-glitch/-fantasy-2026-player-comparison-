import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};
const ledger=read('guardrails/current-football-review.json');
const patch=read('current162patch-2026-08-24.json');
const START=Date.parse(process.env.RECON_START||'2026-08-10T00:00:00Z');
const END=Date.now()+24*60*60*1000;
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const textOf=m=>norm(`${m?.headline||''} ${m?.description||''} ${m?.matched_context||''} ${m?.body_text||''}`);
const negative=/\b(out|ir|injured reserve|pup|nfi|exempt|suspend|surgery|sprain|strain|tear|fracture|missed practice|did not practice|limited|setback|questionable|doubtful|backup|demoted|reduced role|committee|timeshare)\b/i;
const recovery=/\b(returned|return to practice|full practice|full participant|cleared|activated|healthy|no restriction|back at practice)\b/i;
const positiveRole=/\b(starter|starting|first team|featured|lead back|lead receiver|wr1|rb1|te1|qb1|more targets|more carries|increased workload|expanded role|red zone|goal line|two minute|third down|fed|featured role|top two receiver)\b/i;
const role=/\b(role|workload|target|targets|route|routes|snap|snaps|carry|carries|touch|touches|reps|first team|starter|starting|red zone|goal line|committee|timeshare|depth chart|wr1|rb1|te1|qb1|chemistry|timing|connection|trust|offense|scheme|install|playbook)\b/i;
const transaction=/\b(trade|traded|waived|released|signed|acquired|claimed|roster|53 man|cut)\b/i;
function category(t){if(/\b(injur|practice|ir|pup|nfi|exempt|surgery|sprain|strain|tear|fracture|limited|cleared|activated|healthy)\b/i.test(t))return'injury_availability';if(transaction.test(t))return'transaction_team';if(role.test(t))return'role_usage_offense';return'other';}
function direction(t,isTeamContext){if(isTeamContext)return'REVIEW';if(recovery.test(t)&&!negative.test(t))return'UP';if(negative.test(t)&&!recovery.test(t))return'DOWN';if(positiveRole.test(t)&&!negative.test(t))return'UP';if(transaction.test(t))return'CONTEXT';return'REVIEW';}
function dateOf(m){const t=Date.parse(m?.published||'');return Number.isFinite(t)?t:null;}
function reflected(name,t){const p=patch.players?.[name]||{};const model=norm(`${p.st||''} ${p.ns||''} ${p.nm||''} ${p.na||''} ${p.current_recommendation||''}`);if(!model)return false;const toks=[...new Set(t.split(' ').filter(x=>x.length>=6))];return toks.filter(x=>model.includes(x)).length>=3;}
const rows=[];
for(const p of ledger.players||[]){
  const direct=(p.material_news_signals||[]).map(m=>({...m,_teamContext:false}));
  const teamContext=(p.team_context_mentions||[]).map(m=>({...m,_teamContext:true}));
  const mentions=[...direct,...teamContext].map(m=>({...m,_t:dateOf(m),_text:textOf(m)})).filter(m=>m._t!==null&&m._t>=START&&m._t<=END).sort((a,b)=>a._t-b._t);
  if(!mentions.length)continue;
  const seen=new Set();const events=[];
  for(const m of mentions){const key=`${m._teamContext?'TEAM':'DIRECT'}|${m.url||`${m.source}|${m.headline}|${m.description}`}`;if(seen.has(key))continue;seen.add(key);const isTeamContext=Boolean(m._teamContext);events.push({date:new Date(m._t).toISOString(),source:m.source,headline:m.headline||m.description||'',url:m.url||null,team:m.team||p.current_team||p.team||null,context_scope:isTeamContext?'TEAM_OFFENSE':'DIRECT_PLAYER',direct_modeled_players:m.direct_modeled_players||[],category:category(m._text),direction:direction(m._text,isTeamContext),already_reflected:isTeamContext?false:reflected(p.player,m._text)});}
  const directEvents=events.filter(e=>e.context_scope==='DIRECT_PLAYER');
  const teamEvents=events.filter(e=>e.context_scope==='TEAM_OFFENSE');
  const cats={};for(const e of directEvents)(cats[e.category]??=[]).push(e);
  for(const xs of Object.values(cats))for(let i=0;i<xs.length-1;i++)xs[i].status='HISTORICAL_CONTEXT';
  for(const xs of Object.values(cats))if(xs.length)xs.at(-1).status='CURRENT_CATEGORY_STATE';
  const current=Object.values(cats).map(xs=>xs.at(-1));
  const missing=current.filter(e=>!e.already_reflected);
  const dirs=[...new Set(missing.map(e=>e.direction))];
  let suggestion='NO_CHANGE_OR_ALREADY_REFLECTED';
  if(missing.length){if(dirs.length===1&&dirs[0]==='UP')suggestion='REVIEW_UP';else if(dirs.length===1&&dirs[0]==='DOWN')suggestion='REVIEW_DOWN';else if(dirs.includes('UP')&&dirs.includes('DOWN'))suggestion='MIXED_REVIEW';else suggestion='CONTEXT_REVIEW';}
  if(teamEvents.length&&suggestion==='NO_CHANGE_OR_ALREADY_REFLECTED')suggestion='TEAM_CONTEXT_REVIEW';
  rows.push({player:p.player,current_team:p.current_team||p.team||null,current_team_resolution:p.current_team_resolution||null,event_count:events.length,direct_event_count:directEvents.length,team_context_event_count:teamEvents.length,current_category_states:current,missing_current_states:missing.length,suggestion,events});
}
rows.sort((a,b)=>b.missing_current_states-a.missing_current_states||b.team_context_event_count-a.team_context_event_count||b.event_count-a.event_count||a.player.localeCompare(b.player));
const summary={generated_at:new Date().toISOString(),window_start:new Date(START).toISOString(),window_end:new Date(END).toISOString(),players_reviewed:(ledger.players||[]).length,players_with_window_events:rows.length,players_with_team_context:rows.filter(r=>r.team_context_event_count>0).length,players_with_missing_current_states:rows.filter(r=>r.missing_current_states>0).length,suggestion_counts:Object.fromEntries([...new Set(rows.map(r=>r.suggestion))].map(k=>[k,rows.filter(r=>r.suggestion===k).length])),canonical_mutations:0,governance:'PROPOSAL_ONLY',players:rows};
write('analysis/aug10-news-reconciliation.json',summary);
const md=['# Aug. 10-current historical news reconciliation','',`Generated: ${summary.generated_at}`,`Window: ${summary.window_start} -> ${summary.window_end}`,`Universe: ${summary.players_reviewed}`,`Players with qualifying events: ${summary.players_with_window_events}`,`Players with official team-offense context: ${summary.players_with_team_context}`,`Players with current direct states not obviously reflected in canonical notes: ${summary.players_with_missing_current_states}`,'','| Player | Team | Direct events | Team-context events | Missing direct states | Suggestion |','|---|---|---:|---:|---:|---|',...rows.map(r=>`| ${r.player.replaceAll('|','\\|')} | ${r.current_team||''} | ${r.direct_event_count} | ${r.team_context_event_count} | ${r.missing_current_states} | ${r.suggestion} |`),'','No canonical files were changed. Team-offense context is preserved separately from direct player evidence so connected offensive effects can be reviewed without falsely claiming that every team article directly mentioned every player.'];fs.writeFileSync(path.join(root,'analysis/aug10-news-reconciliation.md'),md.join('\n')+'\n');
console.log(JSON.stringify({result:'PASS',window_start:summary.window_start,players_with_window_events:summary.players_with_window_events,players_with_team_context:summary.players_with_team_context,players_with_missing_current_states:summary.players_with_missing_current_states,suggestion_counts:summary.suggestion_counts,top:rows.slice(0,30).map(r=>({player:r.player,team:r.current_team,direct:r.direct_event_count,team_context:r.team_context_event_count,missing:r.missing_current_states,suggestion:r.suggestion}))},null,2));
