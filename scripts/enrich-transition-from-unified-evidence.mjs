import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');
const ledger=read('guardrails/current-football-review.json');
const report=read('analysis/transition-intelligence-current.json');
const byName=new Map((ledger.players||[]).map(x=>[x.player,x]));
const start=Date.parse(report.lookback?.start||'2026-04-01T00:00:00Z');
const end=Date.parse(report.lookback?.end||new Date().toISOString());
const categories={
 scheme_install:/\b(offense|offensive coordinator|coordinator|scheme|system|playbook|install|terminology|concept|motion|under center|shotgun|rpo|play action|protection|progression|reads?)\b/i,
 adaptation:/\b(adapt|adjust|comfortable|learning|command|master|grasp|processing|timing|rhythm|decision making|footwork)\b/i,
 role_usage:/\b(role|usage|first team|starter|starting|reps|snap|route|target|carry|touch|workload|third down|two minute|red zone|goal line|slot|outside|backfield|motion)\b/i,
 chemistry:/\b(chemistry|rapport|connection|trust|timing|sync|communication|working with)\b/i,
 competition:/\b(competition|battle|depth chart|competing|ahead of|behind|split|committee|timeshare|rotate|rotation)\b/i,
 readiness:/\b(healthy|health|recovery|recover|return|practice|limited|full participant|conditioning|ready|rust|sharp|explosive|speed|burst)\b/i,
 prior_season_injury_recovery:/\b(last season|previous season|season ending|returning from|coming back from|rehab|rehabilitation|surgery|acl|mcl|lcl|meniscus|achilles|hamstring|ankle|knee|shoulder|foot|hip|back injury|fracture|torn|tear|repair|cleared for contact|ramp up|workload restriction|recovery timeline|setback|recurrence)\b/i,
 development:/\b(improv|develop|growth|step forward|breakout|polish|refine|mechanics|accuracy|vision|route running|blocking|pass protection)\b/i,
 teammate_environment:/\b(quarterback|qb|running back|receiver|wide receiver|tight end|offensive line|teammate|addition|departure|signed|traded|released)\b/i
};
const classify=t=>Object.entries(categories).filter(([,re])=>re.test(t)).map(([k])=>k);
const inWindow=x=>{const t=Date.parse(x.published||x.date||x.timestamp||'');return Number.isFinite(t)&&t>=start&&t<=end+86400000;};
const key=x=>x.url||`${x.source}|${x.headline}|${x.description}`;
let added=0,playersAdded=0;
for(const row of report.rows||[]){
  const p=byName.get(row.player); if(!p) continue;
  const existing=new Set((row.development_evidence||[]).map(key));
  const candidates=[];
  for(const x of Array.isArray(p.material_news_signals)?p.material_news_signals:[]) candidates.push({...x,direct:true});
  for(const x of Array.isArray(p.material_team_context_signals)?p.material_team_context_signals:[]) candidates.push({...x,direct:false});
  let local=0;
  for(const x of candidates){
    if(!inWindow(x)) continue;
    const txt=`${x.headline||''} ${x.description||''} ${x.matched_context||''}`;
    const cats=classify(txt); if(!cats.length) continue;
    const ev={source:`UNIFIED_LEDGER_FALLBACK:${x.source||'UNKNOWN'}`,original_source:x.source||null,team:x.team||row.team||null,published:x.published||x.date||x.timestamp||null,url:x.url||null,headline:x.headline||null,description:x.description||null,direct_player_evidence:x.direct!==false,team_context_only:x.direct===false,categories:cats,evidence_path:'VALIDATED_UNIFIED_LEDGER_FALLBACK'};
    const k=key(ev); if(existing.has(k)) continue; existing.add(k); row.development_evidence.push(ev); local++; added++;
  }
  if(local){playersAdded++; const d=row.development_evidence.filter(x=>x.direct_player_evidence),t=row.development_evidence.filter(x=>x.team_context_only);row.direct_evidence_count=d.length;row.team_context_count=t.length;row.prior_season_injury_recovery_evidence_count=d.filter(x=>(x.categories||[]).includes('prior_season_injury_recovery')).length;row.prior_season_injury_recovery_status=row.prior_season_injury_recovery_evidence_count?'RECOVERY_EVIDENCE_FOUND':'NO_RECOVERY_EVIDENCE_FOUND';row.categories_covered=[...new Set(row.development_evidence.flatMap(x=>x.categories||[]))];row.transition_signal='EVIDENCE_FOUND';}
}
report.counts={reviewed:report.rows.length,evidence_found:report.rows.filter(x=>x.transition_signal==='EVIDENCE_FOUND').length,no_evidence:report.rows.filter(x=>x.transition_signal==='REVIEWED_NO_EVIDENCE').length,direct_evidence_players:report.rows.filter(x=>x.direct_evidence_count>0).length,team_context_players:report.rows.filter(x=>x.team_context_count>0).length,prior_season_injury_recovery_players:report.rows.filter(x=>x.prior_season_injury_recovery_evidence_count>0).length};
report.fallback_enrichment={result:'PASS',added_evidence:added,players_enriched:playersAdded,rule:'USE_ONLY_DATED_ALREADY_VALIDATED_UNIFIED_LEDGER_EVIDENCE; NEVER FABRICATE_HISTORICAL_EVIDENCE'};
write('analysis/transition-intelligence-current.json',report);
for(const row of report.rows||[]){const p=byName.get(row.player);if(!p)continue;p.transition_intelligence={...(p.transition_intelligence||{}),direct_evidence_count:row.direct_evidence_count,team_context_count:row.team_context_count,prior_season_injury_recovery_evidence_count:row.prior_season_injury_recovery_evidence_count,prior_season_injury_recovery_status:row.prior_season_injury_recovery_status,categories_covered:row.categories_covered,transition_signal:row.transition_signal,evidence:row.development_evidence};}
ledger.transition_intelligence_schema={...(ledger.transition_intelligence_schema||{}),fallback_enrichment:'VALIDATED_UNIFIED_LEDGER_DATED_EVIDENCE'};
write('guardrails/current-football-review.json',ledger);
console.log(JSON.stringify({result:'PASS',added_evidence:added,players_enriched:playersAdded,counts:report.counts},null,2));
if(report.counts.evidence_found===0) {console.error('Transition intelligence still has zero evidence after validated fallback enrichment');process.exit(1);}
