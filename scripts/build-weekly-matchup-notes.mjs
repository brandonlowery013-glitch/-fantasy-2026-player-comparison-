// Use the same verified-evidence preview builder as the deployed Cloudflare reader.
// Preserve manually authored historical notes; add only event-date-specific current stories.
import fs from 'node:fs';
import {buildPreview} from '../lib/matchup-preview.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const schedule=read('data/calibration/weekly-event-schedule-2026.json');
const recommendations=read('data/market/weekly-game-market-recommendations-2026.json');
const ledger=read('data/market/postgame-model-learning-2026.json');
if(schedule.season!==recommendations.season||schedule.week!==recommendations.week)throw Error('Written preview slate mismatch');
const current={};const at=Date.now();
for(const [id,game]of Object.entries(recommendations.games||{})){
 const s=schedule.games[id];
 if(!s||s.away_team!==game.away_team||s.home_team!==game.home_team||Date.parse(s.event_start)!==Date.parse(game.kickoff))throw Error('Written preview identity mismatch '+id);
 // The deployed reader supplements these with fresh injury/inactive reports.
 // No retrospective pregame story is manufactured for an already-started game.
 if(Date.parse(game.kickoff)<=at)continue;
 const p=buildPreview(game,ledger,null,at);
 if(p.evidence.some(e=>e.n<1)||p.sources.length<2)throw Error('Missing verified pregame evidence '+id);
 const canon=t=>({LA:'LAR',WAS:'WSH',JAC:'JAX'}[t]||t);
 const key=`${canon(game.away_team)}@${canon(game.home_team)}:${game.kickoff.slice(0,10)}`;
 const sections=p.sections.map(s=>s.text).filter(s=>s.length>180);
 if(sections.length<2)throw Error('Incomplete written assessment '+id);
 current[key]=sections;
}
const path='lib/weekly-matchup-notes.mjs',marker='// BEGIN VERIFIED WEEKLY PREVIEWS';
let text=fs.readFileSync(path,'utf8');
// Retain prior generated event stories too; never carry them into another event key.
const old=text.includes(marker)?JSON.parse(text.split(marker+'\nconst verifiedWeeklyNotes = ')[1].split(';\nObject.assign')[0]):{};
text=text.split(marker)[0].trimEnd()+'\n\n'+marker+'\nconst verifiedWeeklyNotes = '+JSON.stringify({...old,...current},null,2)+';\nObject.assign(notes, verifiedWeeklyNotes);\n';
fs.writeFileSync(path,text);
console.log(JSON.stringify({week:schedule.week,written_upcoming_games:Object.keys(current).length,source:'verified prior-game observations',model_changes:false}));
