import fs from 'node:fs';

const dataPath='data/probability/generated/historical-enriched-2021-2025.json';
const fixturePath='guardrails/pfr-red-zone-audit-fixture-2024.json';
const reportPath='guardrails/high-value-usage-accuracy-report.json';
if(!fs.existsSync(dataPath)) throw new Error('Run historical enrichment and high-value usage enrichment first.');
const data=JSON.parse(fs.readFileSync(dataPath,'utf8'));
const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
const rows=data.rows||[];
const season=fixture.season;
const metrics=[
  'red_zone_pass_attempts','red_zone_pass_tds','inside_10_pass_attempts','inside_10_pass_tds',
  'red_zone_rush_attempts','red_zone_rush_tds','inside_10_rush_attempts','inside_10_rush_tds','inside_5_rush_attempts','inside_5_rush_tds',
  'red_zone_targets','red_zone_receptions','red_zone_receiving_tds','inside_10_targets','inside_10_receptions','inside_10_receiving_tds'
];
const sum=(arr,k)=>arr.reduce((a,r)=>a+(Number(r[k])||0),0);
const byPlayer=new Map();
for(const r of rows){if(Number(r.season)!==season)continue;if(!byPlayer.has(r.player))byPlayer.set(r.player,[]);byPlayer.get(r.player).push(r);}
const comparisons=[];
const mismatches=[];
for(const [category,players] of Object.entries({passing:fixture.passing,rushing:fixture.rushing,receiving:fixture.receiving})){
  for(const [player,expected] of Object.entries(players)){
    const prs=byPlayer.get(player)||[];
    if(!prs.length){mismatches.push({category,player,metric:'PLAYER_NOT_FOUND',expected:'history rows',actual:0});continue;}
    for(const [metric,exp] of Object.entries(expected)){
      const actual=sum(prs,metric);
      const rec={category,player,metric,expected:exp,actual,match:actual===exp};
      comparisons.push(rec);if(!rec.match)mismatches.push(rec);
    }
  }
}
const invariantFailures=[];
const le=(r,a,b)=>{const av=Number(r[a])||0,bv=Number(r[b])||0;if(av>bv)invariantFailures.push({player:r.player,season:r.season,week:r.week,rule:`${a}<=${b}`,actual:[av,bv]});};
for(const r of rows){
  le(r,'inside_5_rush_attempts','inside_10_rush_attempts');le(r,'inside_10_rush_attempts','red_zone_rush_attempts');
  le(r,'inside_5_rush_tds','inside_10_rush_tds');le(r,'inside_10_rush_tds','red_zone_rush_tds');
  le(r,'inside_5_pass_attempts','inside_10_pass_attempts');le(r,'inside_10_pass_attempts','red_zone_pass_attempts');
  le(r,'inside_5_pass_tds','inside_10_pass_tds');le(r,'inside_10_pass_tds','red_zone_pass_tds');
  le(r,'inside_5_targets','inside_10_targets');le(r,'inside_10_targets','red_zone_targets');
  le(r,'inside_5_receptions','inside_10_receptions');le(r,'inside_10_receptions','red_zone_receptions');
  le(r,'inside_5_receiving_tds','inside_10_receiving_tds');le(r,'inside_10_receiving_tds','red_zone_receiving_tds');
  if((Number(r.red_zone_rush_tds)||0)>(Number(r.red_zone_rush_attempts)||0)) invariantFailures.push({player:r.player,season:r.season,week:r.week,rule:'rush_tds<=rush_attempts'});
  if((Number(r.red_zone_pass_tds)||0)>(Number(r.red_zone_pass_attempts)||0)) invariantFailures.push({player:r.player,season:r.season,week:r.week,rule:'pass_tds<=pass_attempts'});
  if((Number(r.red_zone_receiving_tds)||0)>(Number(r.red_zone_receptions)||0)) invariantFailures.push({player:r.player,season:r.season,week:r.week,rule:'receiving_tds<=receptions'});
  if(r.played===false){for(const k of metrics){if((Number(r[k])||0)!==0) invariantFailures.push({player:r.player,season:r.season,week:r.week,rule:`inactive_${k}_must_be_zero`,actual:r[k]});}}
}
const playerChecks=Object.values(fixture.passing).length+Object.values(fixture.rushing).length+Object.values(fixture.receiving).length;
const report={
  generated_at:new Date().toISOString(),season,source:fixture.source,source_urls:fixture.source_urls,
  independent_player_checks:playerChecks,metric_comparisons:comparisons.length,exact_matches:comparisons.filter(x=>x.match).length,
  mismatches:mismatches.length,invariant_failures:invariantFailures.length,
  result:(mismatches.length||invariantFailures.length)?'BLOCKED':'PASS',
  mismatch_details:mismatches.slice(0,200),invariant_failure_details:invariantFailures.slice(0,200),
  scope_note:'Independent external comparison covers PFR-published season red-zone passing, rushing and receiving splits. Inside-5 receiving and end-zone targets are not externally certified by this fixture and remain internally derived.'
};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(report.result!=='PASS') process.exit(1);
