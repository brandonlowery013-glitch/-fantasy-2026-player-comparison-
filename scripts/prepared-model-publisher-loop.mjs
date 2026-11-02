import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export async function maintainPublisher({cycles=36,intervalMs=300000,cycle,pause=ms=>new Promise(r=>setTimeout(r,ms)),log=console.log}={}){
 if(!Number.isInteger(cycles)||cycles<1||cycles>36||!Number.isFinite(intervalMs)||intervalMs<0||typeof cycle!=='function')throw Error('Invalid bounded publication loop');
 let failures=0,successes=0;
 for(let index=0;index<cycles;index++){
  const started=Date.now();
  try{await cycle(index);failures=0;successes++;log(`Publication ${index+1}/${cycles} completed at ${new Date().toISOString()}`);}
  catch(error){failures++;log(`Publication failed (${failures}/3 consecutive): ${error.message}`);if(failures>=3)throw Error('Three consecutive model publications failed; stopping for automatic recovery and failure reporting');}
  if(index+1<cycles)await pause(Math.max(0,intervalMs-(Date.now()-started)));
 }
 if(!successes)throw Error('No model publication succeeded');
 return {successes,cycles};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await maintainPublisher({cycle:()=>{
 const script=path.join(process.env.GITHUB_WORKSPACE||process.cwd(),'producer/scripts/publish-prepared-model-cycle.sh');
 const result=spawnSync('bash',[script],{stdio:'inherit',env:process.env});if(result.error)throw result.error;if(result.status!==0)throw Error(`Publication cycle exited ${result.status}`);
}});
