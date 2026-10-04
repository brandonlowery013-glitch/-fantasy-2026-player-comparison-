import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),read=p=>JSON.parse(fs.readFileSync(path.join(root,p)));
const artifact=read('data/probability/generated/game-scoring-model-2026.json');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ctd-no-rest-refresh-'));
const save=(p,v)=>{fs.mkdirSync(path.dirname(path.join(temp,p)),{recursive:true});fs.writeFileSync(path.join(temp,p),JSON.stringify(v));};
try{
 save('data/probability/generated/game-scoring-model-2026.json',artifact);save(artifact.validation_path,read(artifact.validation_path));
 save('data/sources/weekly-game-projection-engine-2026.json',{calibrated_scoring:{rest_adjustment_enabled:false}});
 const start=new Date(Date.now()-3600000).toISOString(),future=new Date(Date.now()+86400000).toISOString();
 const game={home_team:'GB',away_team:'CHI',week:2,verified:true};
 save('data/calibration/weekly-event-schedule-2026.json',{season:2026,week:2,sportsbook_inputs_used:false,games:{started:{...game,event_start:start},future:{...game,event_start:future}}});
 const original={...game,event_start:start,model_version:artifact.model_version,home_score_mean:23.123,away_score_mean:19.456,evidence:{original:true}};
 save('data/probability/generated/current-game-scoring-2026.json',{games:{started:original}});
 const fixture={season:{year:2026},events:[{id:'fixture-only',week:{number:1},date:new Date(Date.now()-7*86400000).toISOString(),status:{type:{completed:true}},competitions:[{competitors:[{homeAway:'home',team:{abbreviation:'GB'},score:'24'},{homeAway:'away',team:{abbreviation:'CHI'},score:'20'}]}]}]};
 const moduleUrl=pathToFileURL(path.join(root,'scripts/refresh-current-game-scoring.mjs')).href;
 const script=`globalThis.fetch=async url=>{if(!String(url).startsWith('https://site.api.espn.com/')||!String(url).includes('week=1'))throw Error('Unexpected collection: '+url);return {ok:true,text:async()=>${JSON.stringify(JSON.stringify(fixture))}}};await import(${JSON.stringify(moduleUrl)});`;
 execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:temp,stdio:'pipe'});
 const output=JSON.parse(fs.readFileSync(path.join(temp,'data/probability/generated/current-game-scoring-2026.json')));
 assert.deepEqual(output.games.started,original);assert.equal(output.games.future.model_version,'scoring-decay-no-rest-2026-v2');assert.equal(output.games.future.evidence.rest_adjustment_applied,false);assert.equal(output.sources.length,1);assert.equal(output.games.future.distribution.calibration_status,'BASE_MODEL_RESIDUALS_NO_REST_VARIANT_NOT_REVALIDATED');
 console.log('PASS: future refresh with no rest collector, missing rest input, variant status and immutable started forecast');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
