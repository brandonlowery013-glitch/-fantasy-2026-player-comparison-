import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const ledgerPath=path.join(root,'guardrails/current-football-review.json');
const ledger=JSON.parse(fs.readFileSync(ledgerPath,'utf8'));
const rows=Array.isArray(ledger.materially_implicated_untracked)?ledger.materially_implicated_untracked:[];

function roleRelevant(pos,depth){
  pos=String(pos||'').toUpperCase(); depth=Number(depth);
  return (pos==='QB'&&depth===1)||(pos==='RB'&&depth<=2)||(pos==='WR'&&depth<=3)||(pos==='TE'&&depth<=2);
}
function standaloneRole(pos,depth){
  pos=String(pos||'').toUpperCase(); depth=Number(depth);
  return (pos==='QB'&&depth===1)||(pos==='RB'&&depth===1)||(pos==='WR'&&depth<=2)||(pos==='TE'&&depth===1);
}

let admit=0,hold=0,wait=0;
for(const u of rows){
  const material=Array.isArray(u.material_news_signals)?u.material_news_signals:[];
  const evidenceCount=material.length;
  const relevant=roleRelevant(u.position,u.depth_rank);
  const standalone=standaloneRole(u.position,u.depth_rank);
  const evidenceSummary=material.slice(0,3).map(x=>x.headline||x.description||x.source).filter(Boolean);

  if(relevant && evidenceCount>0){
    u.decision='ADMIT';
    u.reason=`Evidence-backed fantasy-relevant ${u.position||'skill'} role (depth ${u.depth_rank}) with ${evidenceCount} material football signal(s); requires calibrated canonical onboarding before activation.`;
    u.triage_basis={role_relevant:true,standalone_role:standalone,material_signal_count:evidenceCount,evidence_summary:evidenceSummary,rule:'ROLE_PLUS_CORROBORATING_MATERIAL_EVIDENCE'};
    admit++;
  } else if(standalone || relevant){
    u.decision='HOLD_OUT';
    u.reason=`Depth-chart role alone (depth ${u.depth_rank}) is not sufficient for canonical admission in this sweep; no corroborating material football evidence was captured. Re-review when usage/news/market evidence appears.`;
    u.triage_basis={role_relevant:true,standalone_role:standalone,material_signal_count:evidenceCount,evidence_summary:evidenceSummary,rule:'DEPTH_ONLY_IS_DISCOVERY_NOT_ADMISSION'};
    hold++;
  } else {
    u.decision='WAIT';
    u.reason=u.reason||'Connected player discovered below current fantasy-relevance threshold; continue monitoring.';
    u.triage_basis={role_relevant:false,standalone_role:false,material_signal_count:evidenceCount,evidence_summary:evidenceSummary,rule:'MONITOR_BELOW_ADMISSION_THRESHOLD'};
    wait++;
  }
}
ledger.untracked_triage_schema={version:'1.0.0',rule:'DEPTH_CHART_DISCOVERY_IS_NOT_BY_ITSELF_CANONICAL_ADMISSION; ADMIT_REQUIRES_FANTASY_RELEVANT_ROLE_PLUS_CORROBORATING_MATERIAL_FOOTBALL_EVIDENCE',generated_at:new Date().toISOString()};
fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');
const report={generated_at:new Date().toISOString(),result:'PASS',total:rows.length,admit,hold_out:hold,wait,policy:ledger.untracked_triage_schema.rule};
fs.writeFileSync(path.join(root,'guardrails/untracked-candidate-triage-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
