import fs from 'node:fs';
const source='data/calibration/weekly-event-schedule-2026.json',dest='data/history/2026/event-schedule.json';
const current=JSON.parse(fs.readFileSync(source,'utf8'));
const history=fs.existsSync(dest)?JSON.parse(fs.readFileSync(dest,'utf8')):{season:2026,games:{}};
for(const [id,g] of Object.entries(current.games||{})){if(history.games[id]&&String(history.games[id].event_id)!==String(g.event_id))throw Error('Historical event ID cannot be replaced: '+id);history.games[id]=g;}
fs.mkdirSync('data/history/2026',{recursive:true});fs.writeFileSync(dest,JSON.stringify(history,null,2)+'\n');
