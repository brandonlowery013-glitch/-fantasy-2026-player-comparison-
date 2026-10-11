import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {removeRestFromForecast,NO_REST_VERSION} from '../lib/scoring-rest-policy.mjs';
const modelPath='data/probability/generated/game-scoring-model-2026.json',path='data/probability/generated/current-game-scoring-2026.json';
const artifact=JSON.parse(fs.readFileSync(modelPath)),input=JSON.parse(fs.readFileSync(path)),policy=JSON.parse(fs.readFileSync('data/sources/weekly-game-projection-engine-2026.json')).calibrated_scoring;
if(policy.rest_adjustment_enabled!==false||policy.model_version!==NO_REST_VERSION)throw Error('No explicit rest-removal policy');
if(input.model_version!==artifact.model_version||input.artifact_sha256!==createHash('sha256').update(fs.readFileSync(modelPath)).digest('hex')||input.status!=='READY'||input.sportsbook_inputs_used!==false)throw Error('Mismatched scoring source');
const age=Date.now()-Date.parse(input.generated_at);if(!Number.isFinite(age)||age<0||age>86400000)throw Error('Existing scoring source expired; cannot restamp stale evidence');
const now=new Date().toISOString(),games={},changed=[],preserved=[];
for(const [id,g] of Object.entries(input.games)){
 if(!Number.isFinite(Date.parse(g.event_start)))throw Error('Invalid kickoff '+id);
 if(Date.parse(g.event_start)<=Date.parse(now)){games[id]=g;preserved.push(id);}else{games[id]=removeRestFromForecast(artifact,g);changed.push(id);}
}
const output={...input,model_version:NO_REST_VERSION,variant_status:'USER_REQUESTED_UNVALIDATED_ABLATION',base_model_version:artifact.model_version,rest_adjustment_enabled:false,source_generated_at:input.generated_at,generated_at:now,games,rest_removal:{applied_at:now,changed_games:changed,preserved_started_games:preserved,method:'Remove standardized rest terms; keep scoring coefficients, intercept and original source inputs. No retraining or collection.'}};
if(process.argv.includes('--write'))fs.writeFileSync(path,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({mode:process.argv.includes('--write')?'WRITE':'DRY_RUN',changed,preserved,model_version:NO_REST_VERSION}));
