const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('frontend/cloudflare/restore-lock1.js','utf8');
const body=source.slice(source.indexOf('window.CTD_ROLE_WATCH=()=>{'),source.indexOf('window.CTD_REPLACEMENT_WATCH='));
const player=(name,position,rank,status='Active')=>({name,position,athlete_id:name,depth_roles:[{position,rank}],injury_reports:[{status,source_updated_at:new Date().toISOString()}]});
function run(players,usage={}){const ctx={window:{},personnel:{week:2,teams:{T:{team:'T',players}}},weeklySchedule:{week:2},roleUsage:{players:usage},sharedPlayer:n=>({report:players.find(p=>p.name===n).injury_reports[0],game:{event_start:new Date(Date.now()+86400000).toISOString()},opponent:'OPP'}),weeklyEligibility:()=>({state:'ELIGIBLE'}),Date};vm.runInNewContext(body,ctx);return ctx.window.CTD_ROLE_WATCH();}
assert.equal(run([player('Caleb','QB',1),player('Bagent','QB',2,'Out')]).length,0);
assert.equal(run([player('Starter','TE',1),player('Tonges','TE',2,'Out')]).length,0);
assert.equal(run([player('Ladd','WR',1),player('Davis','WR',2,'Out')]).length,0);
let rows=run([player('Ladd','WR',1,'Out'),player('Harris','WR',1),player('Johnston','WR',1),player('Davis','WR',2)],{Ladd:{last_game:{completed:true,date:new Date(Date.now()-3*86400000).toISOString(),player_stat_groups:[{category:'receiving',stats:{REC:'5',TGTS:'7',YDS:'82',TD:'1'}}]}}});
assert.deepEqual(Array.from(rows[0].options,q=>q.name),['Harris','Johnston']);
const usage={Mason:{last_game:{completed:true,date:new Date(Date.now()-3*86400000).toISOString(),player_stat_groups:[{category:'rushing',stats:{CAR:'15',YDS:'59'}}]}}};
rows=run([player('Jones','RB',1),player('Mason','RB',2,'Injured Reserve'),player('Reserve','RB',3)],usage);
assert.match(rows[0].usage,/15 carries · 59 yards/);
assert.match(rows[0].explanation,/unavailable/);
assert.deepEqual(Array.from(rows[0].options,q=>q.name),['Jones','Reserve']);
usage.Mason.last_game.date='2025-09-01';assert.equal(run([player('Mason','RB',2,'Out')],usage).length,0);
console.log('PASS: backup exclusions, relevant receiver room, proven committee workload, expired evidence');

const injured=player('Pierce','WR',1,'Questionable');injured.injury_reports[0].body_part='Wrist';
const detail=run([injured,player('Downs','WR',1)],{Pierce:{last_game:{completed:true,date:new Date(Date.now()-3*86400000).toISOString(),player_stat_groups:[{category:'receiving',stats:{REC:'4',TGTS:'6',YDS:'70',TD:'0'}}]}}})[0];
assert.match(detail.explanation,/Wrist injury/);assert.equal(detail.usage,'4 catches · 70 yards · 0 TD · 6 targets');

const mason=player('Jordan Mason','RB',1,'Injured Reserve');
mason.injury_reports[0].injury_detail='Vikings RB Jordan Mason put on IR after having surgery on thumb';
const masonCard=run([mason,player('Aaron Jones','RB',2)])[0];
assert.match(masonCard.explanation,/surgery on thumb/);
assert.doesNotMatch(masonCard.explanation,/details not supplied/);

assert.equal(run([player('Ja’Kobi Lane','WR',1,'Questionable'),player('Zay Flowers','WR',1)]).length,0);
