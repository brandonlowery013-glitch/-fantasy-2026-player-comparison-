import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');};
const source=read('MODEL_SOURCE_OF_TRUTH.json');
const ledger=read('guardrails/current-football-review.json');
const expected=Number(source.active_player_model),shards=Number(source.runtime_player_shards);
const lookbackStart=process.env.TRANSITION_LOOKBACK_START||`${source.season||2026}-04-01T00:00:00Z`;
const lookbackEnd=process.env.TRANSITION_LOOKBACK_END||new Date().toISOString();
const startMs=Date.parse(lookbackStart),endMs=Date.parse(lookbackEnd);
if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||endMs<startMs)throw new Error('Invalid lookback');
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const canonTeam=x=>({'LAR':'LA','WSH':'WAS','JAC':'JAX'}[String(x||'').toUpperCase()]||String(x||'').toUpperCase());
const teamMap={'Arizona Cardinals':'ARI','Atlanta Falcons':'ATL','Baltimore Ravens':'BAL','Buffalo Bills':'BUF','Carolina Panthers':'CAR','Chicago Bears':'CHI','Cincinnati Bengals':'CIN','Cleveland Browns':'CLE','Dallas Cowboys':'DAL','Denver Broncos':'DEN','Detroit Lions':'DET','Green Bay Packers':'GB','Houston Texans':'HOU','Indianapolis Colts':'IND','Jacksonville Jaguars':'JAX','Kansas City Chiefs':'KC','Las Vegas Raiders':'LV','Los Angeles Chargers':'LAC','Los Angeles Rams':'LA','Miami Dolphins':'MIA','Minnesota Vikings':'MIN','New England Patriots':'NE','New Orleans Saints':'NO','New York Giants':'NYG','New York Jets':'NYJ','Philadelphia Eagles':'PHI','Pittsburgh Steelers':'PIT','San Francisco 49ers':'SF','Seattle Seahawks':'SEA','Tampa Bay Buccaneers':'TB','Tennessee Titans':'TEN','Washington Commanders':'WAS'};
const teamNameByAbbr=new Map(Object.entries(teamMap).map(([name,abbr])=>[abbr,name]));
let players=[];for(let i=0;i<shards;i++)players.push(...read(`players${i}.json`));
if(players.length!==expected)throw new Error(`Universe mismatch ${players.length}/${expected}`);
const reviewByName=new Map((ledger.players||[]).map(x=>[x.player,x]));
const categories={
 scheme_install:/\b(offense|offensive coordinator|coordinator|scheme|system|playbook|install|installation|terminology|concept|motion|under center|shotgun|rpo|play action|protection|progression|reads?)\b/i,
 adaptation:/\b(adapt|adjust|adjusting|comfortable|comfort|learning|learned|command|master|grasp|processing|timing|rhythm|decision making|footwork)\b/i,
 role_usage:/\b(role|usage|first team|starter|starting|reps|snap|route|target|carry|touch|workload|third down|two minute|red zone|goal line|slot|outside|backfield|motion)\b/i,
 chemistry:/\b(chemistry|rapport|connection|trust|timing|sync|communication|favorite target|working with|relationship)\b/i,
 competition:/\b(competition|battle|depth chart|competing|ahead of|behind|split|committee|timeshare|rotate|rotation)\b/i,
 readiness:/\b(healthy|health|recovery|recover|return|practice|limited|full participant|conditioning|ready|rust|sharp|explosive|speed|burst)\b/i,
 prior_season_injury_recovery:/\b(last season|previous season|season ending|returning from|coming back from|rehab|rehabilitation|surgery|surgical|acl|mcl|lcl|meniscus|achilles|hamstring|ankle|knee|shoulder|foot|hip|back injury|fracture|torn|tear|repair|cleared for contact|ramp up|ramping up|workload restriction|recovery timeline|setback|recurrence)\b/i,
 development:/\b(improv|develop|growth|step forward|breakout|polish|refine|mechanics|accuracy|vision|route running|blocking|pass protection)\b/i,
 teammate_environment:/\b(quarterback|qb|running back|receiver|wide receiver|tight end|offensive line|line|teammate|addition|departure|signed|traded|released)\b/i
};
const material=/\b(offense|scheme|playbook|role|usage|reps|starter|practice|chemistry|target|route|carry|touch|workload|quarterback|qb|coordinator|competition|depth chart|red zone|goal line|third down|two minute|healthy|return|recovery|rehab|surgery|acl|mcl|lcl|meniscus|achilles|hamstring|ankle|knee|shoulder|foot|hip|fracture|tear|cleared|ramp up|setback|recurrence|development|improve|timing|protection|progression|motion|under center|shotgun|rpo|play action)\b/i;
const dateFields=['published','lastModified','date','publishedAt','publishDate','publishedDate','lastModifiedDate','created','createdAt','updated','updatedAt'];
function extractDate(a){for(const k of dateFields){const v=a?.[k];if(v!=null&&Number.isFinite(Date.parse(v)))return{value:v,field:k};}return{value:null,field:null};}
async function getJson(url){const r=await fetch(url,{headers:{'user-agent':'fantasy-2026-transition-diagnostics/1.0','accept':'application/json'}});if(!r.ok)throw new Error(`${url} -> ${r.status}`);return r.json();}
function parseNews(payload,sourceName,team=null){const out=[],seen=new WeakSet();const walk=x=>{if(Array.isArray(x)){x.forEach(walk);return;}if(!x||typeof x!=='object'||seen.has(x))return;seen.add(x);const headline=x.headline||x.title||x.name||'';const description=x.description||x.summary||x.story||x.teaser||'';const body=typeof(x.story||x.content||x.body)==='string'?(x.story||x.content||x.body):'';const d=extractDate(x);const url=x.links?.web?.href||x.link||x.url||x.webUrl||null;if(headline||description||body)out.push({source:sourceName,team,headline:String(headline),description:String(description),body_text:String(body),published:d.value,date_field:d.field,url});for(const[k,v]of Object.entries(x))if(v&&typeof v==='object'&&!['links','images','image','video'].includes(k))walk(v);};walk(payload);const keys=new Set();return out.filter(x=>{const k=x.url||`${x.source}|${x.headline}|${x.description}`;if(keys.has(k))return false;keys.add(k);return true;});}
const text=x=>norm(`${x.headline||''} ${x.description||''} ${x.body_text||''}`);
const inWindow=x=>{const t=Date.parse(x.published);return Number.isFinite(t)&&t>=startMs&&t<=endMs+86400000;};
const classify=t=>Object.entries(categories).filter(([,re])=>re.test(t)).map(([k])=>k);
async function teamDirectory(){const j=await getJson('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=40');const out=new Map();for(const row of j.sports?.[0]?.leagues?.[0]?.teams||[]){const t=row.team||row,abbr=canonTeam(t.abbreviation);if(abbr&&t.id)out.set(abbr,String(t.id));}return out;}
const teams=await teamDirectory();if(teams.size!==32)throw new Error(`Team directory ${teams.size}/32`);
const docs=[];const failures=[];
for(const [abbr,id] of teams){try{docs.push(...parseNews(await getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/news?limit=100`),'ESPN_TEAM_TRANSITION',abbr));}catch(e){failures.push(`${abbr}: ${e.message}`);}}
for(let i=0;i<players.length;i+=8){const batch=players.slice(i,i+8);const rs=await Promise.all(batch.map(async p=>{const id=reviewByName.get(p.n)?.espn_athlete_id;if(!id)return[];try{return parseNews(await getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/athletes/${id}/news?limit=100`),'ESPN_PLAYER_TRANSITION',teamMap[p.t]);}catch(e){failures.push(`${p.n}: ${e.message}`);return[];}}));docs.push(...rs.flat());}
const dedup=[];const seen=new Set();for(const d of docs){const k=d.url||`${d.source}|${d.team}|${d.headline}|${d.description}`;if(seen.has(k))continue;seen.add(k);dedup.push(d);}
let parseable=0,windowed=0,categoryMatched=0,playerMatched=0,teamMatched=0;const fieldCounts={};const undatedExamples=[],outsideExamples=[],categoryExamples=[];
for(const d of dedup){if(d.date_field)fieldCounts[d.date_field]=(fieldCounts[d.date_field]||0)+1;const t=Date.parse(d.published);if(Number.isFinite(t))parseable++;else if(undatedExamples.length<20)undatedExamples.push({source:d.source,team:d.team,headline:d.headline});if(!inWindow(d)){if(Number.isFinite(t)&&outsideExamples.length<20)outsideExamples.push({published:d.published,source:d.source,team:d.team,headline:d.headline});continue;}windowed++;const txt=text(d),cats=classify(txt);if(material.test(txt)&&cats.length){categoryMatched++;if(categoryExamples.length<20)categoryExamples.push({published:d.published,source:d.source,team:d.team,headline:d.headline,categories:cats});}
 let pHit=false;for(const p of players){if(txt.includes(norm(p.n))){pHit=true;break;}}if(pHit)playerMatched++;
 const teamName=norm(teamNameByAbbr.get(d.team)||'');if(d.team&&teamName&&txt.includes(teamName))teamMatched++;}
const report={generated_at:new Date().toISOString(),lookback:{start:lookbackStart,end:lookbackEnd},universe:expected,sources:{documents_raw:docs.length,documents_deduped:dedup.length,failures},date_diagnostics:{supported_fields:dateFields,field_counts:fieldCounts,parseable_dates:parseable,undated:dedup.length-parseable,in_window:windowed,outside_window:parseable-windowed},match_diagnostics:{category_matches:categoryMatched,player_name_matches:playerMatched,team_name_matches:teamMatched},examples:{undated:undatedExamples,outside_window:outsideExamples,category_matched:categoryExamples}};
write('guardrails/transition-source-diagnostics.json',report);
console.log(JSON.stringify(report,null,2));
if(!dedup.length)throw new Error('Transition diagnostics found zero source documents');
if(!parseable)throw new Error('Transition diagnostics found zero parseable dates');
if(!windowed)throw new Error('Transition diagnostics found zero in-window documents');
