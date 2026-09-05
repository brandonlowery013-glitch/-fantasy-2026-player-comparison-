import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');};
const source=read('MODEL_SOURCE_OF_TRUTH.json');
const ledger=read('guardrails/current-football-review.json');
const transition=read('analysis/transition-intelligence-current.json');
const season=Number(source.season||2026),expected=Number(source.active_player_model),shards=Number(source.runtime_player_shards);
let players=[];for(let i=0;i<shards;i++)players.push(...read(`players${i}.json`));
if(players.length!==expected)throw new Error(`Universe mismatch ${players.length}/${expected}`);
const reviewByName=new Map((ledger.players||[]).map(x=>[x.player,x]));
const rowByName=new Map((transition.rows||[]).map(x=>[x.player,x]));
async function getJson(url){const r=await fetch(url,{headers:{'user-agent':'fantasy-2026-rookie-development/1.0','accept':'application/json'}});if(!r.ok)throw new Error(`${url} -> ${r.status}`);return r.json();}
function num(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function rookieMeta(j){
  const exp=num(j?.experience?.years??j?.experience?.year??j?.yearsOfExperience??j?.experience);
  const draftYear=num(j?.draft?.year??j?.draftYear??j?.draft?.season?.year);
  const debutYear=num(j?.debutYear??j?.debut?.year);
  let status='UNRESOLVED';let basis=[];
  if(draftYear===season){status='ROOKIE';basis.push(`draft_year=${draftYear}`);}
  if(exp===0){status='ROOKIE';basis.push('experience_years=0');}
  if(status!=='ROOKIE'&&exp!=null&&exp>0){status='VETERAN';basis.push(`experience_years=${exp}`);}
  if(status==='UNRESOLVED'&&draftYear!=null&&draftYear<season){status='VETERAN';basis.push(`draft_year=${draftYear}`);}
  if(status==='UNRESOLVED'&&debutYear!=null&&debutYear<season){status='VETERAN';basis.push(`debut_year=${debutYear}`);}
  return{status,experience_years:exp,draft_year:draftYear,debut_year:debutYear,basis};
}
const rows=[],failures=[];
for(let i=0;i<players.length;i+=10){
  const batch=players.slice(i,i+10);
  const rs=await Promise.all(batch.map(async p=>{
    const review=reviewByName.get(p.n);const athleteId=review?.espn_athlete_id||null;
    if(!athleteId)return{player:p.n,pos:p.p,team:p.t,espn_athlete_id:null,rookie_status:'UNRESOLVED',classification_basis:['NO_ESPN_ATHLETE_ID'],metadata_source:null};
    const urls=[
      `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${season}/athletes/${athleteId}?lang=en&region=us`,
      `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/athletes/${athleteId}?lang=en&region=us`
    ];
    let j=null,used=null,lastErr=null;
    for(const url of urls){try{j=await getJson(url);used=url;break;}catch(e){lastErr=e;}}
    if(!j){failures.push(`${p.n}/${athleteId}: ${lastErr?.message||'metadata unavailable'}`);return{player:p.n,pos:p.p,team:p.t,espn_athlete_id:athleteId,rookie_status:'UNRESOLVED',classification_basis:['ESPN_METADATA_UNAVAILABLE'],metadata_source:null};}
    const m=rookieMeta(j);return{player:p.n,pos:p.p,team:p.t,espn_athlete_id:athleteId,rookie_status:m.status,classification_basis:m.basis,experience_years:m.experience_years,draft_year:m.draft_year,debut_year:m.debut_year,metadata_source:used};
  }));rows.push(...rs);
}
const rookies=rows.filter(x=>x.rookie_status==='ROOKIE');
for(const r of rookies){
  const row=rowByName.get(r.player),review=reviewByName.get(r.player);if(!row||!review)throw new Error(`Rookie missing transition/review row: ${r.player}`);
  const dated=(row.development_evidence||[]).filter(e=>Number.isFinite(Date.parse(e.published||'')));
  const direct=dated.filter(e=>e.direct_player_evidence===true);
  const categories=[...new Set(dated.flatMap(e=>e.categories||[]))];
  const status=dated.length?'EVIDENCE_FOUND':'REVIEWED_NO_DATED_DEVELOPMENT_EVIDENCE';
  const rookieReview={required:true,status,evidence_count:dated.length,direct_evidence_count:direct.length,categories_covered:categories,classification_basis:r.classification_basis,metadata_source:r.metadata_source,rule:'EVERY ACTIVE ROOKIE MUST RECEIVE DEVELOPMENT REVIEW; NO EVIDENCE IS EXPLICIT AND NEVER FABRICATED'};
  row.rookie_development_review=rookieReview;
  row.categories_covered=[...new Set([...(row.categories_covered||[]),'rookie_development_review'])];
  review.transition_intelligence={...(review.transition_intelligence||{}),rookie_development_review:rookieReview};
}
const unresolved=rows.filter(x=>x.rookie_status==='UNRESOLVED');
const report={schema_version:'1.0.0',generated_at:new Date().toISOString(),season,universe:expected,source:'ESPN_CORE_ATHLETE_METADATA',mutation_policy:'REVIEW_ONLY_NO_AUTOMATIC_RANK_CHANGE',counts:{players_checked:rows.length,rookies:rookies.length,veterans:rows.filter(x=>x.rookie_status==='VETERAN').length,unresolved:unresolved.length,rookies_with_dated_development_evidence:rookies.filter(r=>rowByName.get(r.player)?.rookie_development_review?.status==='EVIDENCE_FOUND').length,rookies_reviewed_no_dated_evidence:rookies.filter(r=>rowByName.get(r.player)?.rookie_development_review?.status==='REVIEWED_NO_DATED_DEVELOPMENT_EVIDENCE').length},rookies:rookies.map(r=>({...r,development_review:rowByName.get(r.player)?.rookie_development_review})),unresolved,metadata_failures:failures};
write('analysis/rookie-development-review-current.json',report);
write('analysis/transition-intelligence-current.json',transition);
write('guardrails/current-football-review.json',ledger);
if(rows.length!==expected)throw new Error(`Rookie metadata coverage ${rows.length}/${expected}`);
if(rookies.some(r=>!rowByName.get(r.player)?.rookie_development_review?.required))throw new Error('ROOKIE_DEVELOPMENT_REVIEW_MISSING');
if(unresolved.length>Math.max(5,Math.ceil(expected*.05)))throw new Error(`Rookie classification unresolved too broad: ${unresolved.length}/${expected}`);
console.log(JSON.stringify({result:'PASS',...report.counts,unresolved_players:unresolved.map(x=>x.player)},null,2));
