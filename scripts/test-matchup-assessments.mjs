import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {teamProfile,currentReport,assessment} from '../lib/matchup-assessment.mjs';
import {notes} from '../lib/weekly-matchup-notes.mjs';
import {canon,mergeInjuryReport} from '../lib/matchup-facts.mjs';
import {lineProbabilities} from './lib/distribution-tail-math.mjs';
import {gameWork,propWork} from '../lib/show-work.mjs';
const game={away_team:'IND',home_team:'WAS',kickoff:'2026-10-04T13:30:00Z'};
const injury={date:'2026-10-02T12:00Z',status:'Out',athlete:{displayName:'Example QB',position:{abbreviation:'QB'}}};
const summary={header:{id:'1',competitions:[{date:game.kickoff,neutralSite:true,competitors:[{team:{abbreviation:'WSH'}},{team:{abbreviation:'IND'}}],status:{type:{completed:false}}}]},injuries:[{team:{abbreviation:'WSH'},injuries:[injury,{...injury,date:'2026-10-05'}]}],gameInfo:{venue:{fullName:'London'}}};
assert.equal(currentReport(summary,game,Date.parse('2026-10-04T10:00Z')).injuries.length,1);
assert.equal(currentReport(summary,game,Date.parse('2026-10-05')).injuries.length,0,'later injury reports must not rewrite a pregame story');
assert.equal(currentReport(summary,{...game,home_team:'BUF'}),null,'wrong opponents rejected');
assert.equal(currentReport(summary,{...game,kickoff:'2026-10-11T13:30Z'}),null,'wrong date rejected');
const stats=o=>Object.entries(o).map(([name,displayValue])=>({name,displayValue:String(displayValue)}));
const profile=teamProfile('BUF',[{header:{id:'2'},boxscore:{teams:[{team:{abbreviation:'BUF'},statistics:stats({rushingAttempts:20,rushingYards:100,totalOffensivePlays:50,sacksYardsLost:'2-10'})},{team:{abbreviation:'NYJ'},statistics:stats({rushingAttempts:25,rushingYards:100,netPassingYards:200,sacksYardsLost:'0-0'})}]}}]);
assert.equal(profile.rushYpc,5);assert.equal(profile.rushYpcAllowed,4);assert.equal(profile.sacksMade,0);assert.equal(profile.passYards,null,'missing yards never become zero');assert.equal(profile.passShare,60);
const data={...game,away:'IND',home:'WSH',profiles:[],report:currentReport(summary,game,Date.parse('2026-10-04T10:00Z'))};
const read=assessment({selection:'WAS +4.5'},data);assert.match(read.risk,/not been recalculated/);assert(read.sections.some(s=>s.text.includes('183 yards')));assert(!assessment({}, {...data,kickoff:'2026-10-11T13:30Z',report:null}).sections.some(s=>s.text.includes('183 yards')),'dated editorial cannot leak into another game');
const market=JSON.parse(fs.readFileSync('data/market/weekly-game-market-recommendations-2026.json'));
let covered=0;
for(const g of Object.values(market.games)){
 const key=`${canon(g.away_team)}@${canon(g.home_team)}:${g.kickoff.slice(0,10)}`;
 const story=notes[key];if(key==='IND@WSH:2026-10-04'){covered++;continue;}
 assert(story?.length>=2,`A fresh original assessment is required for ${key}; see docs/matchup-analysis-standard.md`);
 assert(story.every(s=>s.length>180),`Assessment and countercase must be substantive: ${key}`);covered++;
}
const dist=JSON.parse(fs.readFileSync('data/probability/generated/weekly-probability-distributions-2026.json'));
const recs=JSON.parse(fs.readFileSync('data/market/player-prop-recommendations-2026.json'));
let audited=0,conflicts=0,skattebo;
for(const [player,p] of Object.entries(recs.players||{}))for(const e of p.weekly?.evaluations||[]){
 if(e.week!==market.week||!e.model_pick?.side)continue;
 const over=e.model?.over_probability,under=e.model?.under_probability;
 if(Number.isFinite(over)&&Number.isFinite(under)&&Math.abs(over-under)>1e-5)assert.equal(e.model_pick.side,over>under?'OVER':'UNDER',`${player} ${e.stat} direction`);
 const spec=dist.distributions?.[player]?.distributions?.[e.stat];if(!spec)continue;audited++;const probabilities=lineProbabilities(spec,e.line);for(const side of ['over','under','push'])assert(Math.abs(probabilities[side]-e.model[side+'_probability'])<2e-6,`${player} ${e.stat}: saved probability disagrees with displayed distribution at line ${e.line}`);
 const work=propWork(e,spec,{baseline:{mean:spec.mean},mean:spec.mean});
 if((e.model_pick.side==='UNDER'&&spec.mean>e.line)||(e.model_pick.side==='OVER'&&spec.mean<e.line)){assert(work.reader.distributionExplanation,`${player}: mean/direction explanation missing`);conflicts++;}
 if(player==='Cam Skattebo'&&e.stat==='receiving_yards'&&e.line===17.5)skattebo=work;
}
const fixture=propWork({stat:'receiving_yards',line:17.5,model_pick:{side:'UNDER'},recommendation:{decision:'WAIT'},sides:[{side:'UNDER',model_conditional_win_probability:.577803},{side:'OVER',model_conditional_win_probability:.422197}]},{family:'lognormal_shifted',mean:20.1805,parameters:{log_mu:2.7120295043318956,shift:0}},{mean:20.1805,baseline:{mean:20.1805}});assert.match(fixture.reader.distributionExplanation,/15.06/);assert.match(fixture.reader.distributionExplanation,/57.8%/);
const html=fs.readFileSync('index.html','utf8'),sort=html.match(/function orderGameFeed\(\)\{[\s\S]*?\n\}/)[0];
const later={away_team:'C',home_team:'D',event_start:'2026-10-04T20:25Z'},noon={away_team:'A',home_team:'B',event_start:'2026-10-04T17:00Z'},bad={away_team:'X',home_team:'Y',event_start:'unknown'};
const ctx={BET_FEED:{games:[later,bad,noon]},selectedGameIndex:0};vm.runInNewContext(sort+';orderGameFeed()',ctx);assert.deepEqual(ctx.BET_FEED.games,[noon,later,bad]);assert.equal(ctx.BET_FEED.games[ctx.selectedGameIndex],later);
globalThis.CTD_MATCHUP_ASSESSMENT=assessment;globalThis.CTD_MATCHUP_REPORTS=new Map([['test',{...data,profiles:[{sources:[{label:'Same source',url:'https://example.com'},{label:'Same source',url:'https://example.com'}]}]}]]);
const rendered=globalThis.CTD_SHOW_WORK.renderWork({reader:{matchupKey:'test',kind:'spread',summary:'test',details:[]}});assert.equal((rendered.match(/href="https:\/\/example.com"/g)||[]).length,1);assert(!rendered.includes('T12:00'));
console.log(`PASS: ${covered} dated game assessments; ${audited} current-week prop evaluations, ${conflicts} mean/direction explanations; injury as-of isolation, missing values, source deduplication, chronological sorting and selected-game preservation.`);
