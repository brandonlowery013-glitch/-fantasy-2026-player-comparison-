import fs from 'node:fs';

const path='guardrails/current-football-review.json';
const ledger=JSON.parse(fs.readFileSync(path,'utf8'));
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const rules=[
  ['DISCIPLINE_LEGAL',/\b(suspend|suspension|commissioner.?s exempt|exempt list|discipline|disciplinary|investigation|investigat|lawsuit|legal|arrest|charged|charge|conduct|policy violation|rehab|treatment program|off field|off-field)\b/i],
  ['INJURY_AVAILABILITY',/\b(injur|ir|injured reserve|pup|nfi|sprain|strain|tear|fracture|surgery|limited|did not practice|missed practice|return to practice|full practice|activated|cleared|healthy|week 1|week one)\b/i],
  ['COACH_SCHEME_STRUCTURE',/\b(new coach|head coach|offensive coordinator|coordinator|new offense|new system|new scheme|scheme change|install|playbook|structure|philosophy|system fit|offensive identity|coaching staff)\b/i],
  ['NEW_TEAMMATE_ACQUISITION',/\b(trade|traded|signed|signing|acquired|acquisition|claimed|new teammate|new weapon|added .* receiver|added .* running back|added .* tight end|free agent|free-agent)\b/i],
  ['CHEMISTRY_INTEGRATION',/\b(chemistry|connection|timing|trust|rapport|on the same page|sync|synchron|adjusting|adjustment|settling in|learning the offense|learning the system|comfortable|comfort level|integration)\b/i],
  ['ROLE_OPPORTUNITY',/\b(expanded role|bigger role|larger role|more involved|featured|lead back|lead receiver|wr1|rb1|te1|qb1|starter|starting|first team|first-team|more targets|target share|more carries|more touches|workload|red zone|goal line|third down|two minute|depth chart|opportunity)\b/i],
  ['DEVELOPMENT_BREAKOUT',/\b(breakout|break out|take the next step|taking the next step|next step|step forward|bigger year|big year|year 2|year two|year 3|year three|second year|third year|development|developing|improved|improvement|ascending|emerging|emerge)\b/i],
  ['TRANSACTION_ROSTER',/\b(waived|released|cut|roster|53 man|53-man|practice squad|claimed|activated|placed on)\b/i],
  ['OFFENSIVE_ENVIRONMENT',/\b(offense|offensive|quarterback|receiver|running back|tight end|targets|routes|snaps|carries|touches|reps|red zone|goal line|third down|two minute|scheme|playbook)\b/i]
];
function lanes(m){const t=norm(`${m?.headline||''} ${m?.description||''} ${m?.matched_context||''} ${m?.body_text||''}`);return rules.filter(([,re])=>re.test(t)).map(([name])=>name);}
let directTagged=0,teamTagged=0;
const counts={};
for(const p of ledger.players||[]){
  for(const key of ['news_mentions','material_news_signals','direct_material_news_signals']){
    for(const m of p[key]||[]){const xs=lanes(m);if(xs.length){m.context_lanes=[...new Set([...(m.context_lanes||[]),...xs])];m.promote_for_player_review=true;directTagged++;for(const x of xs)counts[x]=(counts[x]||0)+1;}}
  }
  for(const key of ['team_context_mentions','material_team_context_signals']){
    for(const m of p[key]||[]){const xs=lanes(m);if(xs.length){m.context_lanes=[...new Set([...(m.context_lanes||[]),...xs])];m.promote_for_player_review=Boolean((m.direct_modeled_players||[]).includes(p.player));teamTagged++;for(const x of xs)counts[x]=(counts[x]||0)+1;}}
  }
}
for(const [team,items] of Object.entries(ledger.team_offense_context||{}))for(const m of items||[]){const xs=lanes(m);if(xs.length)m.context_lanes=[...new Set([...(m.context_lanes||[]),...xs])];}
ledger.context_lane_schema={version:'1.0.0',purpose:'Explicitly preserve injury, discipline/legal, coaching/scheme, acquisition/new-teammate, chemistry/integration, role/opportunity, development/breakout, transaction, and offensive-environment evidence. Current team is a roster anchor only, not the analysis scope.',lanes:rules.map(([name])=>name),direct_mentions_tagged:directTagged,team_context_mentions_tagged:teamTagged,counts};
fs.writeFileSync(path,JSON.stringify(ledger,null,2)+'\n');
console.log(JSON.stringify({result:'PASS',direct_mentions_tagged:directTagged,team_context_mentions_tagged:teamTagged,counts},null,2));
