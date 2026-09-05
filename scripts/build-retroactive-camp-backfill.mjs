import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};

const src=read('MODEL_SOURCE_OF_TRUTH.json');
const ledger=read('guardrails/current-football-review.json');
const transition=read('analysis/transition-intelligence-current.json');
const phase=read('config/season-phase-2026.json');
const camp=phase.retroactive_camp;
if(!camp?.start||!camp?.end)throw new Error('Retroactive camp phase config missing start/end');

const expected=Number(src.active_player_model);
const start=Date.parse(camp.start),end=Date.parse(camp.end);
if((ledger.players||[]).length!==expected||(transition.rows||[]).length!==expected)throw new Error('Full-universe prerequisite missing');

const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();

const universal={
  scheme_install:/\b(new offense|new offensive coordinator|new coordinator|new scheme|new system|new playbook|new play caller|new playcaller|installing (?:the )?offense|installing (?:a )?scheme|offensive system change|scheme change)\b/i,
  adaptation:/\b(learning (?:the )?(?:new )?(?:offense|system|playbook)|adjusting to (?:the )?(?:new )?(?:offense|system|scheme|quarterback|nfl|pro game)|getting comfortable (?:in|with)|grasp of (?:the )?(?:offense|system)|command of (?:the )?(?:offense|system)|settling into (?:the )?(?:offense|role)|picking up (?:the )?(?:offense|system|playbook))\b/i,
  chemistry:/\b(chemistry|rapport|connection|timing|trust|on the same page|building (?:a )?connection|developing (?:a )?connection|working on timing)\b/i,
  readiness:/\b(injur(?:y|ed)|soreness|sprain|strain|tear|fracture|surgery|limited (?:in|at) practice|did not practice|missed practice|left practice|exits? practice|out of practice|placed on (?:pup|nfi|ir)|activated from (?:pup|nfi|ir)|returned to practice|returns? to practice|cleared to practice|cleared to play|healthy enough|ramping up|setback|recurrence)\b/i,
  prior_season_injury_recovery:/\b(rehab(?:bing|ilitation)?|recover(?:y|ing)? from|returning from|coming back from|months removed from|year removed from|cleared after|ramping up after|surgery last (?:season|year)|acl (?:rehab|recovery)|achilles (?:rehab|recovery)|meniscus (?:rehab|recovery)|return from (?:acl|achilles|meniscus|surgery))\b/i,
  new_team:/\b(traded to|acquired by|signed with|joined (?:the )?[a-z]+|new team|first camp with|first season with)\b/i,
  coach_signal:/\b(coach|head coach|offensive coordinator|coordinator|play caller|playcaller|position coach)\b.{0,100}\b(said|says|praised|expects|plans|wants|noted|called|described|believes|told reporters)\b|\b(said|says|praised|expects|plans|wants|noted|called|described|believes|told reporters)\b.{0,100}\b(coach|coordinator)\b/i,
  media_signal:/\b(reporter|beat writer|practice report|camp report|observed|noted in practice|according to|media availability)\b/i
};

const positionRules={
  RB:{
    committee:/\b(running back committee|backfield committee|committee backfield|committee role|split backfield|shared backfield|rotation at running back|backfield rotation|timeshare|time share)\b/i,
    touch_volume:/\b(carries|carry share|touches|touch share|workload|lead back|featured back|workhorse|early down|early-down|goal line|goal-line|red zone|red-zone|third down|third-down|two minute|two-minute|passing downs|receiving role|targets out of the backfield|split carries|more carries|more touches|first team reps|first-team reps|working with (?:the )?first team|with the ones)\b/i,
    backfield_injury_impact:/\b(backfield|running back|rb)\b.{0,140}\b(injur(?:y|ed)|out|miss|limited|pup|ir|surgery|sprain|strain|tear)\b|\b(injur(?:y|ed)|out|miss|limited|pup|ir|surgery|sprain|strain|tear)\b.{0,140}\b(backfield|running back|rb|carries|touches|workload)\b/i,
    rookie_adjustment:/\b(rookie|first year|first-year)\b.{0,160}\b(pass protection|blitz pickup|protection|vision|patience|reads|playbook|offense|nfl|pro game|route running|receiving|first team|first-team|ones|trust)\b|\b(pass protection|blitz pickup|vision|patience|reads|playbook|nfl|pro game)\b.{0,160}\b(rookie|first year|first-year)\b/i,
    role_security:/\b(ahead of|behind|depth chart|battle for|competing for|competition for|earned a role|losing work|lose work|role security|starter|starting job)\b/i,
    scheme_touch_impact:/\b(zone scheme|gap scheme|outside zone|inside zone|run scheme|rushing scheme|offensive coordinator|play caller|playcaller|new offense|new system)\b.{0,180}\b(carries|touches|workload|backfield|running back|receiving role|goal line|third down|usage)\b|\b(carries|touches|workload|backfield|running back|receiving role|goal line|third down|usage)\b.{0,180}\b(zone scheme|gap scheme|outside zone|inside zone|run scheme|rushing scheme|offensive coordinator|play caller|playcaller|new offense|new system)\b/i
  },
  QB:{
    playbook_adaptation:/\b(learning|picking up|grasp|command|comfortable|adjusting|installing)\b.{0,120}\b(offense|playbook|system|scheme|terminology|progressions|protections)\b/i,
    receiver_chemistry:/\b(chemistry|rapport|connection|timing|trust|on the same page|looking to|favorite target|go to target|go-to target|targeting)\b.{0,150}\b(receiver|wide receiver|wr|tight end|te|pass catcher|target)\b|\b(receiver|wide receiver|wr|tight end|te|pass catcher|target)\b.{0,150}\b(chemistry|rapport|connection|timing|trust|on the same page)\b/i,
    practice_preference:/\b(first read|first-read|looking toward|looking to|targeting|peppering|feeding|favorite target|go to target|go-to target|most targeted|practice targets)\b/i,
    new_team_qb:/\b(traded to|acquired by|signed with|new team|first camp with|first season with)\b.{0,180}\b(playbook|offense|chemistry|rapport|receiver|tight end|wr|te|timing|system)\b|\b(playbook|offense|chemistry|rapport|receiver|tight end|wr|te|timing|system)\b.{0,180}\b(traded to|acquired by|signed with|new team|first camp with|first season with)\b/i,
    role_security:/\b(qb competition|quarterback competition|battle for starting quarterback|named starter|starting quarterback|first team reps|first-team reps|with the ones|starter reps)\b/i
  },
  WR:{
    rookie_adjustment:/\b(rookie|first year|first-year)\b.{0,180}\b(playbook|offense|nfl|pro game|route running|release|separation|coverage|chemistry|rapport|timing|first team|first-team|ones|trust|blocking)\b|\b(playbook|nfl|pro game|route running|release|separation|coverage|chemistry|rapport|timing)\b.{0,180}\b(rookie|first year|first-year)\b/i,
    target_hierarchy:/\b(target share|targets|target volume|target distribution|pecking order|hierarchy|first read|first-read|number one receiver|no 1 receiver|wr1|wr2|slot role|outside role|x receiver|z receiver|featured receiver|lead receiver|routes|route share|first team reps|first-team reps|with the ones)\b/i,
    role_security:/\b(ahead of|behind|depth chart|battle for|competing for|competition for|role security|losing snaps|lose snaps|losing targets|lose targets|rotation|receiver rotation|wr rotation|crowded receiver room|crowded wr room|unsettled receiver room|unsettled wr room|no clear wr1|no established wr1|three receiver sets|three-receiver sets|two receiver sets|two-receiver sets)\b/i,
    qb_chemistry:/\b(chemistry|rapport|connection|timing|trust|on the same page|favorite target|go to target|go-to target)\b.{0,140}\b(quarterback|qb|starter)\b|\b(quarterback|qb|starter)\b.{0,140}\b(chemistry|rapport|connection|timing|trust|on the same page|favorite target|go to target|go-to target)\b/i,
    unstable_room:/\b(crowded receiver room|crowded wr room|unsettled receiver room|unsettled wr room|no clear wr1|no established wr1|receiver rotation|wr rotation|targets spread around|spread the ball around|target distribution remains fluid|pecking order remains fluid)\b/i
  },
  TE:{
    rookie_adjustment:/\b(rookie|first year|first-year)\b.{0,180}\b(playbook|offense|nfl|pro game|route running|blocking|inline|in line|slot|chemistry|rapport|timing|first team|first-team|ones|trust)\b|\b(playbook|nfl|pro game|route running|blocking|inline|in line|slot|chemistry|rapport|timing)\b.{0,180}\b(rookie|first year|first-year)\b/i,
    target_hierarchy:/\b(target share|targets|target volume|routes|route share|slot role|inline role|in line role|red zone|red-zone|goal line|first read|first-read|featured tight end|lead tight end|te1|first team reps|first-team reps|with the ones)\b/i,
    role_security:/\b(ahead of|behind|depth chart|battle for|competing for|competition for|role security|losing snaps|lose snaps|rotation|two tight end|two-tight-end|12 personnel|13 personnel)\b/i,
    qb_chemistry:/\b(chemistry|rapport|connection|timing|trust|on the same page|favorite target|go to target|go-to target)\b.{0,140}\b(quarterback|qb|starter)\b|\b(quarterback|qb|starter)\b.{0,140}\b(chemistry|rapport|connection|timing|trust|on the same page|favorite target|go to target|go-to target)\b/i
  }
};

function universalCategories(t){return Object.entries(universal).filter(([,r])=>r.test(t)).map(([k])=>k);}
function positionTopics(t,pos){const rules=positionRules[pos]||{};return Object.entries(rules).filter(([,r])=>r.test(t)).map(([k])=>k);}
function materialForPosition(t,pos){
  const universalCats=universalCategories(t),topics=positionTopics(t,pos);
  const injury=universalCats.includes('readiness')||universalCats.includes('prior_season_injury_recovery');
  const schemeOrTeam=universalCats.includes('scheme_install')||universalCats.includes('adaptation')||universalCats.includes('new_team');
  const chemistry=universalCats.includes('chemistry');
  let relevant=topics.length>0||injury;
  if(pos==='RB'&&schemeOrTeam)relevant=relevant||/\b(running back|backfield|rb|carries|touches|workload|receiving role|goal line|third down|usage)\b/i.test(t);
  if(pos==='QB'&&(schemeOrTeam||chemistry))relevant=true;
  if((pos==='WR'||pos==='TE')&&(schemeOrTeam||chemistry))relevant=relevant||/\b(target|targets|routes|role|receiver|tight end|wr|te|quarterback|qb|chemistry|rapport|timing|playbook|offense)\b/i.test(t);
  return {relevant,categories:[...new Set([...universalCats,...topics])],topics};
}

const byTransition=new Map(transition.rows.map(x=>[x.player,x]));
const key=e=>e.url||`${e.source}|${e.headline}|${e.published}`;
function localContext(m,player){
  const phrase=norm(player),headline=norm(m.headline||''),description=norm(m.description||''),matched=norm(m.matched_context||'');
  if(m.source==='GOOGLE_NEWS_RSS')return headline;
  const namedHead=headline.includes(phrase)?headline:'',namedDesc=description.includes(phrase)?description:'',namedMatched=matched.includes(phrase)?matched:'';
  if(!m.body_text)return norm(`${namedHead} ${namedDesc} ${namedMatched}`);
  const body=norm(m.body_text);if(!phrase||!body.includes(phrase))return norm(`${namedHead} ${namedDesc} ${namedMatched}`);
  const windows=[];let from=0;
  while(windows.length<5){const i=body.indexOf(phrase,from);if(i<0)break;windows.push(body.slice(Math.max(0,i-240),Math.min(body.length,i+phrase.length+240)));from=i+phrase.length;}
  return norm(`${namedHead} ${namedDesc} ${namedMatched} ${windows.join(' ')}`);
}

const stop=new Set('the a an and or but to of in on for with from at is are was were be been being nfl football player players news update report reports says said'.split(' '));
function tokens(s,player){const p=new Set(norm(player).split(' '));return new Set(norm(s).split(' ').filter(x=>x.length>2&&!stop.has(x)&&!p.has(x)));}
function similarity(a,b){if(!a.size||!b.size)return 0;let n=0;for(const x of a)if(b.has(x))n++;return n/Math.max(a.size,b.size);}
function dedupeEvents(events,player){const out=[];for(const e of events.sort((a,b)=>Date.parse(a.published)-Date.parse(b.published))){const et=tokens(e.headline,player),ed=Date.parse(e.published);const dup=out.some(x=>Math.abs(ed-Date.parse(x.published))<=3*86400000&&x.categories.some(c=>e.categories.includes(c))&&similarity(et,tokens(x.headline,player))>=0.55);if(!dup)out.push(e);}return out;}

// Regression controls for position-specific fantasy materiality.
if(materialForPosition('ja marr chase fantasy article target blank','WR').relevant)throw new Error('Regression: RSS navigation text classified as WR opportunity evidence');
const currentInjury=materialForPosition('ja marr chase exits practice with knee injury','WR');if(!currentInjury.relevant||!currentInjury.categories.includes('readiness')||currentInjury.categories.includes('prior_season_injury_recovery'))throw new Error('Regression: current WR injury confused with prior-season recovery');
const rehab=materialForPosition('ashton jeanty returning from acl rehab and working with first team in the backfield','RB');if(!rehab.relevant||!rehab.categories.includes('prior_season_injury_recovery')||!rehab.topics.includes('touch_volume'))throw new Error('Regression: RB recovery/workload evidence not recognized');
const scheme=materialForPosition('quarterback is learning the new offense under a new offensive coordinator','QB');if(!scheme.relevant||!scheme.categories.includes('scheme_install')||!scheme.categories.includes('adaptation'))throw new Error('Regression: QB scheme adaptation not recognized');
const rbCommittee=materialForPosition('coach says the rookie running back is splitting carries in a committee backfield and improving pass protection','RB');if(!rbCommittee.relevant||!rbCommittee.topics.includes('committee')||!rbCommittee.topics.includes('rookie_adjustment'))throw new Error('Regression: RB committee/rookie adaptation not recognized');
const qbChem=materialForPosition('new quarterback is building chemistry and timing with his wide receiver and tight end while picking up the playbook','QB');if(!qbChem.relevant||!qbChem.topics.includes('receiver_chemistry')||!qbChem.topics.includes('playbook_adaptation'))throw new Error('Regression: QB playbook/chemistry evidence not recognized');
const wrHierarchy=materialForPosition('parker washington is taking first team reps and competing for targets in the receiver hierarchy','WR');if(!wrHierarchy.relevant||!wrHierarchy.topics.includes('target_hierarchy')||!wrHierarchy.topics.includes('role_security'))throw new Error('Regression: WR target hierarchy evidence not recognized');
const gbRoom=materialForPosition('green bay has an unsettled receiver room with no clear wr1 and a fluid target distribution as jordan love spreads the ball around','WR');if(!gbRoom.relevant||!gbRoom.topics.includes('unstable_room')||!gbRoom.topics.includes('target_hierarchy')||!gbRoom.topics.includes('role_security'))throw new Error('Regression: Green Bay-style unstable WR room not recognized');
const teChem=materialForPosition('rookie tight end is developing chemistry with the quarterback and earning first team routes','TE');if(!teChem.relevant||!teChem.topics.includes('rookie_adjustment')||!teChem.topics.includes('target_hierarchy'))throw new Error('Regression: TE development/target role evidence not recognized');

let evidencePlayers=0,checkedNoEvidence=0,gaps=0,added=0,discoveryRejected=0,positionRejected=0,duplicatesCollapsed=0;
const positionCounts={RB:{players:0,evidence_found:0,evidence:0},QB:{players:0,evidence_found:0,evidence:0},WR:{players:0,evidence_found:0,evidence:0},TE:{players:0,evidence_found:0,evidence:0},OTHER:{players:0,evidence_found:0,evidence:0}};
const rows=[];

for(const p of ledger.players||[]){
  const tr=byTransition.get(p.player);if(!tr)throw new Error(`Missing transition row: ${p.player}`);
  const pos=String(p.position||p.pos||tr.position||'OTHER').toUpperCase();
  const bucket=positionCounts[pos]||positionCounts.OTHER;bucket.players++;
  const phrase=norm(p.player),acceptedRaw=[],seen=new Set();
  const candidates=[...(p.news_mentions||[]),...(p.external_news_mentions||[]),...(p.team_context_mentions||[]).filter(x=>(x.direct_modeled_players||[]).includes(p.player))];
  for(const m of candidates){
    const k=key(m);if(seen.has(k))continue;seen.add(k);
    const t=Date.parse(m.published||'');if(!Number.isFinite(t)||t<start||t>end)continue;
    const local=localContext(m,p.player);
    const playerBound=m.player_bound===true||m.context_scope==='DIRECT_PLAYER'||(m.direct_modeled_players||[]).includes(p.player)||(phrase&&local.includes(phrase));
    if(!playerBound)continue;
    if(phrase&&!local.includes(phrase)){discoveryRejected++;continue;}
    if(m.source==='GOOGLE_NEWS_RSS'&&m.source_tier!=='MAJOR_MEDIA'){discoveryRejected++;continue;}
    const material=materialForPosition(local,pos);
    if(!material.categories.length){discoveryRejected++;continue;}
    if(!material.relevant){positionRejected++;continue;}
    acceptedRaw.push({
      source:`RETROACTIVE_CAMP:${m.source||'UNKNOWN'}`,original_source:m.source||null,publisher:m.publisher||null,
      team:p.retroactive_canonical_team||p.current_team||p.team||tr.team||null,position:pos,published:m.published,url:m.url||null,
      headline:m.headline||null,description:m.description||null,matched_context:local,
      categories:material.categories,position_topics:material.topics,
      coach_signal:material.categories.includes('coach_signal'),media_signal:material.categories.includes('media_signal'),
      direct_player_evidence:true,team_context_only:false,retroactive_camp_evidence:true,local_player_binding:true,
      evidence_tier:'MATERIAL_DIRECT_POSITION_SPECIFIC',
      evidence_authority:m.source==='GOOGLE_NEWS_RSS'?'MAJOR_MEDIA_POSITION_SPECIFIC_EVENT':'PRIMARY_OR_BOUND_POSITION_SPECIFIC_EVENT'
    });
  }
  const accepted=dedupeEvents(acceptedRaw,p.player);duplicatesCollapsed+=acceptedRaw.length-accepted.length;
  const existing=new Set((tr.development_evidence||[]).map(key)),fresh=accepted.filter(x=>!existing.has(key(x)));
  tr.development_evidence=[...(tr.development_evidence||[]),...fresh].sort((a,b)=>Date.parse(a.published||0)-Date.parse(b.published||0)).slice(-80);
  added+=fresh.length;bucket.evidence+=accepted.length;if(accepted.length)bucket.evidence_found++;
  const rss=p.retroactive_player_news_search?.status,official=p.retroactive_official_team_search?.status;
  let status;
  if(accepted.length){status='EVIDENCE_FOUND';evidencePlayers++;}
  else if(rss==='CHECKED'||official==='CHECKED'){status='SOURCE_CHECKED_NO_MATERIAL_EVIDENCE';checkedNoEvidence++;}
  else{status='SOURCE_COVERAGE_GAP';gaps++;}
  tr.retroactive_camp_audit={
    required:true,status,position:pos,evidence_count:accepted.length,discovery_candidates:candidates.length,
    sources_checked:{player_rss:rss||'NOT_ATTEMPTED',official_team_sitemap:official||'NOT_ATTEMPTED'},
    window:{start:camp.start,end:camp.end},local_player_binding_required:true,position_specific_materiality_required:true,
    fantasy_opportunity_scope:pos==='RB'?'committee/touches/backfield injury/rookie adjustment/new-team or coordinator touch impact':pos==='QB'?'playbook adaptation/receiver-TE chemistry/practice preference/new-team transition/injury':pos==='WR'?'rookie adjustment/target hierarchy/unstable WR-room role security/QB chemistry/injury':pos==='TE'?'rookie adjustment/target-route hierarchy/role security/QB chemistry/injury':'universal injury/scheme only',
    rule:'SOURCE COVERAGE IS DISTINCT FROM MATERIAL EVIDENCE; ONLY PLAYER-LOCAL, POSITION-SPECIFIC FANTASY OPPORTUNITY EVENTS ENTER CHRONOLOGY'
  };
  rows.push({player:p.player,position:pos,status,evidence_count:accepted.length,discovery_candidates:candidates.length,player_rss:rss||'NOT_ATTEMPTED',official_team_sitemap:official||'NOT_ATTEMPTED',evidence:accepted});
}

transition.retroactive_camp_backfill={
  mandatory:true,window:camp,persistent_opportunity_watches:phase.persistent_opportunity_watches||[],
  counts:{players:expected,evidence_found:evidencePlayers,source_checked_no_material_evidence:checkedNoEvidence,source_coverage_gap:gaps,evidence_added:added,discovery_rejected:discoveryRejected,position_irrelevant_rejected:positionRejected,duplicate_event_reports_collapsed:duplicatesCollapsed},
  position_counts:positionCounts,
  policy:'CAMP IS CLOSED HISTORICAL CONTEXT; 166/166 SOURCE COVERAGE DOES NOT IMPLY 166/166 MATERIAL EVENTS; MATERIALITY IS POSITION-SPECIFIC AND TIED TO FANTASY OPPORTUNITY, ROLE, CHEMISTRY, SCHEME, OR INJURY/RECOVERY'
};

write('analysis/transition-intelligence-current.json',transition);
write('guardrails/retroactive-camp-backfill-report.json',{generated_at:new Date().toISOString(),result:gaps?'PARTIAL_SOURCE_GAPS':'PASS',...transition.retroactive_camp_backfill,rows});
if(rows.length!==expected)throw new Error(`Retroactive coverage ${rows.length}/${expected}`);
console.log(JSON.stringify({result:gaps?'PARTIAL_SOURCE_GAPS':'PASS',...transition.retroactive_camp_backfill.counts,position_counts:positionCounts},null,2));
