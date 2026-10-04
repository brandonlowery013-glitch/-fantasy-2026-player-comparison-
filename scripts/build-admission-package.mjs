import fs from 'node:fs';
import path from 'node:path';
import {generateAdmission} from './generate-admission-package.mjs';
// Preserve the existing builder entry point; there is one generation and validation path.
export function buildAdmissionPackage({candidateId,base=process.cwd()}){
  const file=path.join(base,'admissions/queue.json');
  const queue=JSON.parse(fs.readFileSync(file,'utf8'));
  const entry=queue.entries.find(x=>x.candidate_id===candidateId);
  if(!entry)throw Error(`candidate not found: ${candidateId}`);
  const result=generateAdmission({base,entry});
  entry.status=result.status;entry.blockers=result.blockers||[];entry.staged_path=`admissions/staged/${candidateId}.json`;
  fs.writeFileSync(file,JSON.stringify(queue,null,2)+'\n');
  return {candidate_id:candidateId,status:result.status,before_count:result.canonical_before?.players,after_count:result.expected_after_count,blockers:entry.blockers,package_path:result.package?entry.package_path:null};
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname){
  if(!process.argv[2])throw Error('usage: node scripts/build-admission-package.mjs <candidate_id>');
  console.log(JSON.stringify(buildAdmissionPackage({candidateId:process.argv[2]}),null,2));
}
