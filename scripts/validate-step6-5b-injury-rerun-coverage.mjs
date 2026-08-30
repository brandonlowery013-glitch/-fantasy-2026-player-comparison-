import fs from 'node:fs';

const c=JSON.parse(fs.readFileSync('data/sources/step6-5b-injury-rerun-coverage-2026.json','utf8'));
const failures=[];
const need=(v,m)=>{if(!v) failures.push(m);};

need(c.schema_version==='STEP6_5B_INJURY_RERUN_COVERAGE_1.0.0','schema mismatch');
need(c.status==='IN_PROGRESS_FULL_RERUN','rerun must remain in-progress until all-32 completion');
need(c.window?.post_cut_reconciliation_required===true,'post-cut reconciliation required');
for(const p of ['QB','RB','WR','TE','K']) need(c.population_scope?.fantasy_positions?.includes(p),`missing fantasy position ${p}`);
for(const p of ['OT','OG','C','EDGE','DE','DT','LB','CB','S']) need(c.population_scope?.impact_non_fantasy_positions?.includes(p),`missing impact position ${p}`);
for(const key of ['Alec Pierce','Malik Nabers','George Kittle','Micah Parsons','Austin Jackson','Nick Bosa','Fred Warner']) need(c.newly_caught_examples?.some(x=>x.subject===key),`missing regression case ${key}`);
need(c.qa_requirements?.some(x=>x.includes('Every fantasy-relevant player reviewed')),'fantasy-wide review requirement missing');
need(c.qa_requirements?.some(x=>x.includes('OL and defensive player')),'impact non-fantasy review requirement missing');
need(c.qa_requirements?.some(x=>x.includes('Recovery/activation')),'recovery chronology requirement missing');
need(c.qa_requirements?.some(x=>x.includes('Current-state resolution')),'current-state resolution requirement missing');

if(failures.length){console.error(JSON.stringify({status:'FAIL',failures},null,2));process.exit(1);}
console.log(JSON.stringify({status:'PASS',fantasy_positions:c.population_scope.fantasy_positions.length,impact_positions:c.population_scope.impact_non_fantasy_positions.length,seed_cases:c.newly_caught_examples.length},null,2));
