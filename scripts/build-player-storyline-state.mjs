import fs from 'node:fs';
import zlib from 'node:zlib';

const R=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const W=(p,x)=>{fs.mkdirSync(p.split('/').slice(0,-1).join('/'),{recursive:true});fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n')};
const source=R('MODEL_SOURCE_OF_TRUTH.json');
const report=R('analysis/transition-intelligence-current.json');
const patch=R(source.current_update_layer);
const manifest=R('analysis/player-scouting-context-recovered-2026-09-05.json');
const encoded=manifest.payload.ordered_files.map(f=>fs.readFileSync(`analysis/scouting-context-payload/${f}`,'utf8').trim()).join('');
const scouting=JSON.parse(zlib.gunzipSync(Buffer.from(encoded,'base64')).toString('utf8'));
let players=[];
for(let i=0;i<source.runtime_player_shards;i++)players.push(...R(`players${i}.json`));
players=players.map(p=>({...p,...(patch.players?.[p.n]||{})}));
if(players.length!==166||new Set(players.map(x=>x.n)).size!==166)throw new Error(`canonical universe ${players.length}/166`);
if((scouting.players||[]).length!==166)throw new Error(`scouting universe ${(scouting.players||[]).length}/166`);
if((report.rows||[]).length!==166)throw new Error(`transition universe ${(report.rows||[]).length}/166`);

const names=players.map(x=>x.n);
const byScout=new Map(scouting.players.map(x=>[x.n,x]));
const byTransition=new Map(report.rows.map(x=>[x.player,x]));
const txt=x=>String(x||'').replace(/\s+/g,' ').trim();
const first=(o,keys)=>{for(const k of keys)if(txt(o?.[k]))return txt(o[k]);return null};
const eventText=e=>txt(`${e.headline||''} ${e.description||''} ${e.matched_context||''}`);
const healthRe=/\b(injur|ankle|knee|hamstring|shoulder|foot|acl|pup|injured reserve|\bir\b|limited|practice|cleared|return|questionable|doubtful|out\b|surgery|recovery|healthy)\b/i;
const roleRe=/\b(target share|first[- ]read|targets?|routes?|snaps?|touches?|carries|goal[- ]line|red[- ]zone|passing downs?|third down|starter|starting|role|workload|committee|split|featured|lead back|wr1|wr2|rb1|rb2|chemistry|connection|timing|scheme)\b/i;
const uncertaintyRe=/\b(uncertain|competition|committee|emerg|breakout|rebound|recovery|injur|role|split|target|volume|usage|watch|contingent|unproven|new offense|new team|quarterback)\b/i;

const templates={
  RB:{watch:['snap share','carries/touches','targets and routes','passing-down role','goal-line/red-zone work','health/availability'],up:'Move up only if real usage exceeds the saved workload/receiving/TD-access baseline or a competing back loses meaningful work.',down:'Move down for a sustained workload loss, receiving-role loss, goal-line loss, efficiency collapse tied to role, or material injury.',components:['role','production','ceiling','reliability','availability']},
  WR:{watch:['route participation','target share','first-read share','targets per route','red-zone/end-zone usage','QB chemistry/timing','competition for targets','health/availability'],up:'Move up if route/target/first-read dominance or QB connection is materially stronger than the saved baseline.',down:'Move down if another receiver consistently takes meaningful routes/targets/first reads, the QB connection deteriorates, or health materially limits usage.',components:['role','production','ceiling','reliability','environment','availability']},
  TE:{watch:['route participation','target share','targets per route','red-zone usage','blocking vs receiving deployment','QB chemistry','competition for routes/targets','health/availability'],up:'Move up if receiving routes, target share or red-zone involvement materially exceed the saved role.',down:'Move down if blocking/rotation suppresses routes, another target earner takes the receiving role, or health limits usage.',components:['role','production','ceiling','reliability','environment','availability']},
  QB:{watch:['pass attempts/dropbacks','designed rushing and scrambles','red-zone rushing','pressure/protection','weapon availability','scheme/play-calling','TD efficiency','health/availability'],up:'Move up if passing volume, rushing usage, protection or weapon quality materially improves versus the saved baseline.',down:'Move down if volume/rushing usage falls, protection/weapon environment deteriorates, efficiency proves unsustainable, or health limits play.',components:['production','ceiling','environment','reliability','availability']}
};

const rows=[];
for(const p of players){
  const s=byScout.get(p.n);if(!s)throw new Error(`missing scouting ${p.n}`);
  const thesis=first(s,['scouting_thesis','thesis','current_thesis','football_case','scouting_outlook','archetype'])||first(s,['summary','primary_case'])||`${p.n} enters 2026 with the saved canonical role and projection baseline.`;
  const classification=first(s,['historical_classification','classification','career_direction'])||null;
  const risk=first(s,['primary_risk','risk','main_risk','risks','primary_constraint'])||null;
  const blob=txt(`${classification||''} ${thesis||''} ${risk||''}`);
  const connected=names.filter(n=>n!==p.n&&blob.toLowerCase().includes(n.toLowerCase())).slice(0,8);
  const base=templates[p.p]||templates.WR;
  const storyline_type=uncertaintyRe.test(blob)?'ACTIVE_QUESTION':'BASELINE_MONITOR';
  const tr=byTransition.get(p.n)||{};
  const events=(tr.chronological_development?.events||tr.development_evidence||[]);
  const relevant=[];
  for(const e of events){
    const t=eventText(e); if(!t.toLowerCase().includes(p.n.toLowerCase()))continue;
    const watched=healthRe.test(t)||roleRe.test(t);
    if(!watched)continue;
    relevant.push({published:e.published||null,phase:e.phase||null,headline:e.headline||null,source_url:e.url||e.source_url||null,relevance_reason:healthRe.test(t)?'health/availability can change the saved thesis':'usage/role/chemistry evidence maps to this player storyline'});
  }
  rows.push({
    player:p.n,position:p.p,team:p.t,storyline_type,
    historical_classification:classification,
    starting_storyline:thesis,
    primary_risk:risk,
    connected_players:connected,
    watch_for:base.watch,
    move_up_if:base.up,
    move_down_if:base.down,
    model_components_to_reconsider:base.components,
    current_state:'STARTING_STORYLINE_ACTIVE',
    relevant_evidence_count:relevant.length,
    recent_story_beats:relevant.slice(-6),
    news_policy:'Visible news stays short and current (Yahoo/ESPN style). This storyline is internal scouting context used to interpret whether news/game evidence should affect the model.'
  });
}
const out={schema_version:'1.0.0',as_of:new Date().toISOString(),players:166,policy:'The scouting thesis initializes each player season storyline. Incoming evidence must answer a player-specific watch item or represent a material health/role deviation before it can influence model components. Regular-season usage supersedes camp evidence when it resolves the same question.',rows};
W('analysis/player-storyline-state-current.json',out);
const md=['# Player storyline state — 166-player universe','',`Players: ${rows.length}`,'','| Player | Pos | Storyline type | Starting storyline | Watch |','|---|---|---|---|---|',...rows.map(r=>`| ${r.player} | ${r.position} | ${r.storyline_type} | ${(r.starting_storyline||'').replaceAll('|','/')} | ${r.watch_for.join('; ').replaceAll('|','/')} |`)];
fs.writeFileSync('analysis/player-storyline-state-current.md',md.join('\n')+'\n');
if(rows.length!==166||rows.some(r=>!r.starting_storyline||!r.watch_for.length||!r.model_components_to_reconsider.length))throw new Error('storyline completeness');
console.log(JSON.stringify({result:'PASS',players:rows.length,active_questions:rows.filter(r=>r.storyline_type==='ACTIVE_QUESTION').length,baseline_monitors:rows.filter(r=>r.storyline_type==='BASELINE_MONITOR').length},null,2));
