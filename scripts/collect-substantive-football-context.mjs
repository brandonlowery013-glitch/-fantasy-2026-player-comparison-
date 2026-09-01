import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{const full=path.join(root,p);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,JSON.stringify(x,null,2)+'\n');};
const source=read('MODEL_SOURCE_OF_TRUTH.json');
const contract=read('data/sources/automatic-football-context-adapters-2026.json');
const schedule=read('data/calibration/weekly-event-schedule-2026.json');
const ledgerPath='data/ingestion/weekly-football-source-snapshots-2026.json';
const ledger=read(ledgerPath);
const activeCount=Number(source.active_player_model),shards=Number(source.runtime_player_shards);
const week=Number(schedule.week);
if(!Number.isInteger(week)||week<1||week>18)throw new Error(`Invalid verified schedule week ${schedule.week}`);
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
const stable=x=>Array.isArray(x)?x.map(stable):(x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x);
const fp=x=>crypto.createHash('sha256').update(JSON.stringify(stable(x))).digest('hex').slice(0,20);
const espnAlias={LAR:'LA',WSH:'WAS',JAC:'JAX'};
const canonTeam=x=>espnAlias[String(x||'').toUpperCase()]||String(x||'').toUpperCase();
const teamMap={'Arizona Cardinals':'ARI','Atlanta Falcons':'ATL','Baltimore Ravens':'BAL','Buffalo Bills':'BUF','Carolina Panthers':'CAR','Chicago Bears':'CHI','Cincinnati Bengals':'CIN','Cleveland Browns':'CLE','Dallas Cowboys':'DAL','Denver Broncos':'DEN','Detroit Lions':'DET','Green Bay Packers':'GB','Houston Texans':'HOU','Indianapolis Colts':'IND','Jacksonville Jaguars':'JAX','Kansas City Chiefs':'KC','Las Vegas Raiders':'LV','Los Angeles Chargers':'LAC','Los Angeles Rams':'LA','Miami Dolphins':'MIA','Minnesota Vikings':'MIN','New England Patriots':'NE','New Orleans Saints':'NO','New York Giants':'NYG','New York Jets':'NYJ','Philadelphia Eagles':'PHI','Pittsburgh Steelers':'PIT','San Francisco 49ers':'SF','Seattle Seahawks':'SEA','Tampa Bay Buccaneers':'TB','Tennessee Titans':'TEN','Washington Commanders':'WAS'};
const players=[];
for(let i=0;i<shards;i++)for(const p of read(`players${i}.json`)){const team=teamMap[p.t];if(!team)throw new Error(`Unknown team for ${p.n}: ${p.t}`);players.push({name:p.n,position:String(p.p||'').toUpperCase(),team});}
if(players.length!==activeCount)throw new Error(`Universe mismatch ${players.length}/${activeCount}`);
const byNorm=new Map(players.map(p=>[norm(p.name),p]));

async function getJson(url){const r=await fetch(url,{headers:{'user-agent':'fantasy-2026-substantive-context'}});if(!r.ok)throw new Error(`${url} -> ${r.status}`);return r.json();}
async function teamDirectory(){const j=await getJson('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=40');const out=new Map();for(const row of j.sports?.[0]?.leagues?.[0]?.teams||[]){const t=row.team||row;const abbr=canonTeam(t.abbreviation);if(abbr&&t.id)out.set(abbr,String(t.id));}return out;}
function parseDepth(payload){const rows=[];const seenObj=new WeakSet();const walk=(x,posHint='')=>{if(Array.isArray(x)){x.forEach((v,i)=>walk(v,posHint||String(i+1)));return;}if(!x||typeof x!=='object'||seenObj.has(x))return;seenObj.add(x);const pos=String(x.position?.abbreviation||x.position?.name||x.name||x.position||posHint||'').toUpperCase();const athletes=x.athletes||x.items;if(Array.isArray(athletes))athletes.forEach((a,i)=>{const athlete=a?.athlete||a;const name=athlete?.displayName||athlete?.fullName||athlete?.name;const explicit=Number(a?.rank??athlete?.rank);const rank=Number.isFinite(explicit)&&explicit>0?explicit:i+1;const p=String(athlete?.position?.abbreviation||pos||'').toUpperCase();const active=typeof athlete?.active==='boolean'?athlete.active:(typeof a?.active==='boolean'?a.active:null);if(name&&rank)rows.push({name,rank,position:p,active});});for(const v of Object.values(x))if(v&&typeof v==='object')walk(v,pos);};walk(payload.depthchart||payload.depthcharts||payload.items||payload);const seen=new Set();return rows.filter(r=>{const k=`${norm(r.name)}|${r.position}|${r.rank}`;if(seen.has(k))return false;seen.add(k);return true;});}
function parseInjuries(payload){const rows=[];const seenObj=new WeakSet();const walk=x=>{if(Array.isArray(x)){x.forEach(walk);return;}if(!x||typeof x!=='object'||seenObj.has(x))return;seenObj.add(x);const athlete=x.athlete||x.player;const name=athlete?.displayName||athlete?.fullName||x.displayName||x.fullName;const status=x.status||x.type?.description||x.type?.name||x.description;const practice=x.practiceStatus||x.details?.practiceStatus||null;const body=x.details?.type||x.injury?.type||x.bodyPart||x.details?.detail||null;if(name&&status)rows.push({name,status:String(status),practice_status:practice,body_part:body});for(const v of Object.values(x))if(v&&typeof v==='object'&&v!==athlete)walk(v);};walk(payload);const by=new Map();for(const r of rows)if(!by.has(norm(r.name)))by.set(norm(r.name),r);return [...by.values()];}
function injuryAvailability(x){const s=`${x?.status||''} ${x?.practice_status||''}`.toLowerCase();if(/\b(out|injured reserve|\bir\b|physically unable|\bpup\b|suspend)/.test(s))return false;if(/\b(active|full participant|full practice)\b/.test(s))return true;return null;}
function cohort(pos,rank){if(pos==='QB'&&rank===1)return 'QB_STARTER';if(pos==='RB')return rank===1?'RB_LEAD':rank===2?'RB_COMMITTEE':null;if(pos==='WR')return rank===1?'WR_FULL_TIME':rank===2?'WR_NEAR_FULL_TIME':null;if(pos==='TE')return rank===1?'TE_RECEIVING':rank===2?'TE_SECONDARY_RECEIVING':null;return null;}
const captured=new Date().toISOString();
const snapshot=(type,p,evidence,extra={})=>({snapshot_id:`2026-W${week}-${type}-${norm(p.name)}-${fp(evidence)}`,week,signal_type:type,player:p.name,source:contract.adapters[type].automated_source,captured_at:captured,stat_adjustments:{},evidence,...extra});
const teams=await teamDirectory();
if(teams.size!==32)throw new Error(`Team directory coverage ${teams.size}/32`);
const generated=[];const failures=[];let totalDepthRows=0,matchedDepthRows=0;
for(const [abbr,id] of teams){let depth=[],inj=[];try{depth=parseDepth(await getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/depthcharts`));}catch(e){failures.push(`depth ${abbr}: ${e.message}`);}try{inj=parseInjuries(await getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/injuries`));}catch(e){failures.push(`injury ${abbr}: ${e.message}`);}totalDepthRows+=depth.length;const injBy=new Map(inj.map(x=>[norm(x.name),x]));for(const d of depth){const p=byNorm.get(norm(d.name));if(!p||p.team!==abbr||!['QB','RB','WR','TE'].includes(p.position))continue;matchedDepthRows++;const injury=injBy.get(norm(p.name));const injuryActive=injuryAvailability(injury);const explicitActive=injuryActive!==null?injuryActive:(typeof d.active==='boolean'&&contract.availability_contract.explicit_espn_athlete_active_flag_may_support_availability?d.active:null);const c=cohort(p.position,d.rank);if(c)generated.push(snapshot('role',p,{team:abbr,depth_rank:d.rank,position:p.position,espn_name:d.name,espn_active_flag:d.active,rank_source:Number.isFinite(Number(d.rank))?'explicit_or_array_order':'array_order'},{cohort:c,...(explicitActive===null?{}:{expected_active:explicitActive})}));if(p.position==='QB'&&d.rank===1)generated.push(snapshot('qb_context',p,{team:abbr,expected_qb:p.name,depth_rank:1,certainty:'DEPTH_CHART_QB1'}));}
for(const x of inj){const p=byNorm.get(norm(x.name));if(!p||p.team!==abbr)continue;const a=injuryAvailability(x);generated.push(snapshot('injury',p,{team:abbr,status:x.status,practice_status:x.practice_status,body_part:x.body_part,authoritative_cross_check:contract.adapters.injury.authoritative_cross_check},a===null?{}:{expected_active:a}));}}
if(totalDepthRows<160)failures.push(`Depth coverage too low: ${totalDepthRows} rows`);
if(matchedDepthRows<80)failures.push(`Tracked depth coverage too low: ${matchedDepthRows}/${activeCount}`);
const uniqueTracked=new Set(generated.map(x=>x.player));
if(uniqueTracked.size<80)failures.push(`Tracked signal coverage too low: ${uniqueTracked.size}/${activeCount}`);
if(!generated.some(x=>x.signal_type==='role'))failures.push('No role snapshots generated');
if(!generated.some(x=>x.signal_type==='qb_context'))failures.push('No QB context snapshots generated');
if(failures.length)throw new Error(`Substantive live context collection failed:\n${failures.join('\n')}`);
const existing=new Set((ledger.snapshots||[]).map(x=>x.snapshot_id));const added=generated.filter(x=>!existing.has(x.snapshot_id));
write(ledgerPath,{...ledger,schema_version:'1.3.0',status:'LIVE_AUTOMATIC_SOURCE_SNAPSHOTS',sportsbook_inputs_used:false,last_adapter_run_at:captured,snapshots:[...(ledger.snapshots||[]),...added]});
const report={generated_at:captured,result:'PASS',week,teams:teams.size,total_depth_rows:totalDepthRows,matched_tracked_depth_rows:matchedDepthRows,unique_tracked_players_with_signals:uniqueTracked.size,generated_rows:generated.length,appended_rows:added.length,counts:Object.fromEntries(contract.write_contract.allowed_signal_types.map(t=>[t,generated.filter(x=>x.signal_type===t).length])),sportsbook_inputs_used:false};
write('guardrails/substantive-football-context-collection-report.json',report);console.log(JSON.stringify(report,null,2));
