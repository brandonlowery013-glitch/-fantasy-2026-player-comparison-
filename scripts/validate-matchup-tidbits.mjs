import fs from 'node:fs';

const CONTRACT='data/sources/matchup-tidbits-2026.json';
const OUT='data/probability/generated/matchup-tidbits-2026.json';
const requireOutput=process.argv.includes('--require-output');
const errors=[];
const c=JSON.parse(fs.readFileSync(CONTRACT,'utf8'));
if(c.schema_version!=='1.0.0')errors.push('schema_version');
if(c.season!==2026)errors.push('season');
if(c.mode!=='DESCRIPTIVE_INTERFACE_CONTEXT_ONLY')errors.push('mode');
if(c.actionable!==false||c.production_numeric_authority!==0)errors.push('numeric authority');
if(c.selection_rules?.families_are_examples_not_model_features!==true)errors.push('fact families must be examples, not model features');
if(c.selection_rules?.no_fact_family_has_intrinsic_predictive_weight!==true)errors.push('intrinsic predictive weight must be false');
const guards=(c.guardrails||[]).join(' ');
for(const phrase of ['descriptive context','privileged model category','tiny-sample','may not write football projections'])if(!guards.includes(phrase))errors.push(`missing guardrail: ${phrase}`);
if(!Array.isArray(c.supported_fact_families)||c.supported_fact_families.length<5)errors.push('fact families');
if(requireOutput){
  if(!fs.existsSync(OUT))errors.push('generated output missing');
  else{
    const o=JSON.parse(fs.readFileSync(OUT,'utf8'));
    if(o.production_numeric_authority!==0||o.actionable!==false)errors.push('output authority');
    for(const g of Object.values(o.games||{})){
      if(!Array.isArray(g.tidbits))errors.push(`tidbits missing ${g.game_id}`);
      if(g.tidbits?.length>(c.interface_contract?.max_default_tidbits_per_game||8))errors.push(`too many tidbits ${g.game_id}`);
      for(const t of g.tidbits||[]){
        for(const k of c.interface_contract.required_fields||[])if(t[k]===undefined||t[k]===null||t[k]==='')errors.push(`missing ${k} ${g.game_id}`);
        if(t.descriptive_only!==true)errors.push(`non-descriptive tidbit ${t.tidbit_id}`);
      }
    }
  }
}
console.log(JSON.stringify({result:errors.length?'BLOCKED':'PASS',schema:c.schema_version,mode:c.mode,fact_families:c.supported_fact_families?.length||0,production_numeric_authority:c.production_numeric_authority,output_required:requireOutput,errors},null,2));
if(errors.length)process.exit(1);
