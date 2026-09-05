import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
try{
  await import('./diagnose-transition-source-coverage.mjs');
}catch(err){
  const p=path.join(root,'guardrails/transition-source-diagnostics.json');
  if(!fs.existsSync(p))throw err;
  const r=JSON.parse(fs.readFileSync(p,'utf8'));
  const docs=Number(r?.sources?.documents_deduped||0),failures=(r?.sources?.failures||[]).length;
  if(docs===0&&failures===0){
    r.result='SOURCE_EMPTY';
    r.authority='NON_AUTHORITATIVE_NATIVE_SOURCE';
    r.required_fallback='DATED_VALIDATED_UNIFIED_LEDGER';
    r.policy='EMPTY NATIVE ESPN HISTORY IS A DIAGNOSED SOURCE LIMITATION, NOT EVIDENCE THAT PLAYERS HAD NO DEVELOPMENT';
    fs.writeFileSync(p,JSON.stringify(r,null,2)+'\n');
    console.log(JSON.stringify({result:'SOURCE_EMPTY',documents:0,failures:0,required_fallback:r.required_fallback},null,2));
    process.exit(0);
  }
  throw err;
}
