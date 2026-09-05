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
function signalText(x){
  return `${x?.headline||''} ${x?.description||''} ${x?.matched_context||''} ${x?.body_text||''}`.toLowerCase();
}
function isUnavailableSignal(x){
  const t=signalText(x);
  return /\b(out for (?:the )?(?:season|year)|season[- ]ending|torn acl|placed on injured reserve|placed on ir|reverted to injured reserve|waived|released|cut|terminated|practice squad)\b/i.test(t);
}
function isNegativeRoleSignal(x){
  const t=signalText(x);
  return /\b(failed to earn (?:a )?top[- ]?three job|needed depth behind|depth behind|buried behind|lost (?:the )?(?:starting|starter) job|demoted|waived|released|cut|practice squad)\b/i.test(t);
}
function isOpportunitySignal(x){
  const t=signalText(x);
  return /\b(start(?:er|ing)?|won (?:the )?job|first[- ]team|next in line|top back|lead back|third[- ]down|role|workload|targets?|routes?|carries|touches|acquired|traded|signed|prominent role|competition|battle|qb1|rb1|rb2|wr1|wr2|te1)\b/i.test(t) && !isUnavailableSignal(x) && !isNegativeRoleSignal(x);
}

let admit=0,hold=0,wait=0;
for(const u of rows){
  const material=Array.isArray(u.material_news_signals)?u.material_news_signals:[];
  const evidenceCount=material.length;
  const relevant=roleRelevant(u.position,u.depth_rank);
  const standalone=standaloneRole(u.position,u.depth_rank);
  const unavailable=material.some(isUnavailableSignal);
  const negativeRole=material.some(isNegativeRoleSignal);
  const opportunitySignals=material.filter(isOpportunitySignal);
  const corroboratingCount=opportunitySignals.length;
  const evidenceSummary=material.slice(0,3).map(x=>x.headline||x.description||x.source).filter(Boolean);

  if(unavailable){
    u.decision='HOLD_OUT';
    u.reason=`Current evidence shows the player is unavailable, waived/released, or otherwise not in an active fantasy-usable role; do not admit from a stale depth-chart slot. Re-review after an active-roster/availability change.`;
    u.triage_basis={role_relevant:relevant,standalone_role:standalone,material_signal_count:evidenceCount,corroborating_opportunity_signal_count:corroboratingCount,evidence_summary:evidenceSummary,rule:'CURRENT_UNAVAILABLE_OR_OFF_ROSTER_BLOCKS_ADMISSION'};
    hold++;
  } else if(negativeRole && corroboratingCount===0){
    u.decision='HOLD_OUT';
    u.reason=`Current evidence explicitly describes a depth-only or diminished role and does not corroborate standalone/contingent fantasy opportunity; hold outside the canonical universe.`;
    u.triage_basis={role_relevant:relevant,standalone_role:standalone,material_signal_count:evidenceCount,corroborating_opportunity_signal_count:0,evidence_summary:evidenceSummary,rule:'EXPLICIT_NEGATIVE_ROLE_OVERRIDES_STALE_DEPTH_SLOT'};
    hold++;
  } else if(relevant && corroboratingCount>0){
    u.decision='ADMIT';
    u.reason=`Evidence-backed fantasy-relevant ${u.position||'skill'} role (depth ${u.depth_rank}) with ${corroboratingCount} corroborating opportunity signal(s); requires calibrated canonical onboarding before activation.`;
    u.triage_basis={role_relevant:true,standalone_role:standalone,material_signal_count:evidenceCount,corroborating_opportunity_signal_count:corroboratingCount,evidence_summary:evidenceSummary,rule:'ROLE_PLUS_CORROBORATING_OPPORTUNITY_EVIDENCE'};
    admit++;
  } else if(standalone || relevant){
    u.decision='HOLD_OUT';
    u.reason=`Depth-chart role and/or non-opportunity news alone is not sufficient for canonical admission in this sweep; no corroborating active fantasy opportunity evidence was captured. Re-review when usage/role evidence appears.`;
    u.triage_basis={role_relevant:true,standalone_role:standalone,material_signal_count:evidenceCount,corroborating_opportunity_signal_count:corroboratingCount,evidence_summary:evidenceSummary,rule:'DEPTH_OR_NON_OPPORTUNITY_NEWS_IS_DISCOVERY_NOT_ADMISSION'};
    hold++;
  } else {
    u.decision='WAIT';
    u.reason=u.reason||'Connected player discovered below current fantasy-relevance threshold; continue monitoring.';
    u.triage_basis={role_relevant:false,standalone_role:false,material_signal_count:evidenceCount,corroborating_opportunity_signal_count:corroboratingCount,evidence_summary:evidenceSummary,rule:'MONITOR_BELOW_ADMISSION_THRESHOLD'};
    wait++;
  }
}
ledger.untracked_triage_schema={version:'1.1.0',rule:'DEPTH_CHART_DISCOVERY_IS_NOT_BY_ITSELF_CANONICAL_ADMISSION; ADMIT_REQUIRES_ACTIVE FANTASY-RELEVANT ROLE PLUS CORROBORATING OPPORTUNITY EVIDENCE; UNAVAILABLE/OFF-ROSTER/EXPLICIT-NEGATIVE-ROLE EVIDENCE BLOCKS ADMISSION',generated_at:new Date().toISOString()};
fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');
const report={generated_at:new Date().toISOString(),result:'PASS',total:rows.length,admit,hold_out:hold,wait,policy:ledger.untracked_triage_schema.rule};
fs.writeFileSync(path.join(root,'guardrails/untracked-candidate-triage-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
