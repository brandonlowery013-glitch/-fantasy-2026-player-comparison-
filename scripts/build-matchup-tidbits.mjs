import fs from 'node:fs';
import path from 'node:path';

const CONTRACT='data/sources/matchup-tidbits-2026.json';
const OUT='data/probability/generated/matchup-tidbits-2026.json';
const canon=x=>({LA:'LAR',JAC:'JAX',WSH:'WAS'}[String(x||'').toUpperCase()]||String(x||'').toUpperCase());
const num=x=>x===''||x==null?null:(Number.isFinite(Number(x))?Number(x):null);

function parseCSV(t){
  const lines=t.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);
  const parse=l=>{let a=[],s='',q=false;for(let i=0;i<=l.length;i++){const c=l[i]??',';if(c==='"'){if(q&&l[i+1]==='"'){s+='"';i++}else q=!q}else if(c===','&&!q){a.push(s);s=''}else s+=c}return a};
  const h=parse(lines.shift());
  return lines.map(l=>{const a=parse(l),o={};h.forEach((k,i)=>o[k]=a[i]??'');return o});
}

function normalizeRow(g){
  return {
    id:String(g.game_id||''),season:Number(g.season),week:Number(g.week),game_type:String(g.game_type||'').toUpperCase(),
    home:canon(g.home_team),away:canon(g.away_team),hs:num(g.home_score),as:num(g.away_score),
    spread:num(g.spread_line),total:num(g.total_line),gameday:String(g.gameday||''),gametime:String(g.gametime||'')
  };
}

async function loadRows(){
  const c=JSON.parse(fs.readFileSync(CONTRACT,'utf8'));
  const r=await fetch(c.source.url,{headers:{'user-agent':'fantasy-2026-matchup-tidbits'}});
  if(!r.ok)throw new Error(`matchup tidbit source fetch ${r.status}`);
  return parseCSV(await r.text()).map(normalizeRow);
}

const result=(v,eps=1e-9)=>v>eps?'W':v<-eps?'L':'P';
const ouResult=(v,eps=1e-9)=>v>eps?'O':v<-eps?'U':'P';
function teamGame(g,team){
  const home=g.home===team;
  if(!home&&g.away!==team)return null;
  if(g.hs==null||g.as==null)return null;
  const pf=home?g.hs:g.as, pa=home?g.as:g.hs, margin=pf-pa;
  const teamSpread=g.spread==null?null:(home?-g.spread:g.spread);
  return {
    game_id:g.id,season:g.season,week:g.week,team,opponent:home?g.away:g.home,venue:home?'HOME':'ROAD',
    pf,pa,margin,su:result(margin),
    ats:teamSpread==null?null:result(margin+teamSpread),
    ou:g.total==null?null:ouResult(g.hs+g.as-g.total)
  };
}

function rec(xs,kind){
  const out=kind==='OU'?{o:0,u:0,p:0,g:0}:{w:0,l:0,p:0,g:0};
  for(const x of xs){const v=x[kind.toLowerCase()];if(!v)continue;out.g++;if(kind==='OU'){if(v==='O')out.o++;else if(v==='U')out.u++;else out.p++;}else{if(v==='W')out.w++;else if(v==='L')out.l++;else out.p++;}}
  return out;
}
const fmtRec=(r,kind)=>kind==='OU'?`${r.o}-${r.u}${r.p?`-${r.p}`:''} O/U`:`${r.w}-${r.l}${r.p?`-${r.p}`:''}`;
const avg=(xs,key)=>xs.length?xs.reduce((s,x)=>s+x[key],0)/xs.length:null;

function tidbit({gameId,scope,subject,text,statType,sample,window,priority=0}){
  return {tidbit_id:`${gameId}:${statType}:${subject}:${window}`.replace(/\s+/g,'_'),game_id:gameId,scope,subject,text,stat_type:statType,sample_size:sample,window,source:'nflverse nfldata schedules/games.csv',descriptive_only:true,_priority:priority};
}

function streak(rows){
  if(!rows.length)return null;
  const last=rows.at(-1).su;if(!['W','L'].includes(last))return null;
  let n=0;for(let i=rows.length-1;i>=0&&rows[i].su===last;i--)n++;
  return {side:last,n};
}

function teamCandidates(game,team,history){
  const all=history.map(g=>teamGame(g,team)).filter(Boolean).sort((a,b)=>a.season-b.season||a.week-b.week||a.game_id.localeCompare(b.game_id));
  const venue=game.home===team?'HOME':'ROAD';
  const venueRows=all.filter(x=>x.venue===venue);
  const out=[];
  for(const n of [5,10]){
    const recent=all.slice(-n);if(recent.length>=Math.min(n,5)){
      const su=rec(recent,'SU'), ats=rec(recent,'ATS'), ou=rec(recent,'OU');
      out.push(tidbit({gameId:game.id,scope:'TEAM',subject:team,text:`${team} is ${fmtRec(su,'SU')} in its last ${recent.length} games.`,statType:'RECENT_RECORD',sample:su.g,window:`LAST_${recent.length}`,priority:40+n}));
      if(ats.g>=4)out.push(tidbit({gameId:game.id,scope:'TEAM',subject:team,text:`${team} is ${fmtRec(ats,'ATS')} ATS over its last ${ats.g} lined games.`,statType:'RECENT_ATS',sample:ats.g,window:`LAST_${recent.length}`,priority:55+n}));
      if(ou.g>=4)out.push(tidbit({gameId:game.id,scope:'TEAM',subject:team,text:`${team}'s last ${ou.g} lined games are ${fmtRec(ou,'OU')}.`,statType:'RECENT_OU',sample:ou.g,window:`LAST_${recent.length}`,priority:50+n}));
    }
  }
  const vr=venueRows.slice(-10);if(vr.length>=5){
    const ats=rec(vr,'ATS'),ou=rec(vr,'OU');
    if(ats.g>=5)out.push(tidbit({gameId:game.id,scope:'TEAM',subject:team,text:`${team} is ${fmtRec(ats,'ATS')} ATS in its last ${ats.g} ${venue.toLowerCase()} games.`,statType:'HOME_ROAD_ATS',sample:ats.g,window:`LAST_${ats.g}_${venue}`,priority:62}));
    if(ou.g>=5)out.push(tidbit({gameId:game.id,scope:'TEAM',subject:team,text:`${team}'s last ${ou.g} ${venue.toLowerCase()} games are ${fmtRec(ou,'OU')}.`,statType:'HOME_ROAD_OU',sample:ou.g,window:`LAST_${ou.g}_${venue}`,priority:52}));
  }
  const last5=all.slice(-5);if(last5.length>=3){
    const p=avg(last5,'pf'),m=avg(last5,'margin');
    out.push(tidbit({gameId:game.id,scope:'TEAM',subject:team,text:`${team} has averaged ${p.toFixed(1)} points over its last ${last5.length} games.`,statType:'RECENT_SCORING',sample:last5.length,window:`LAST_${last5.length}`,priority:48}));
    out.push(tidbit({gameId:game.id,scope:'TEAM',subject:team,text:`${team}'s average scoring margin over its last ${last5.length} games is ${m>=0?'+':''}${m.toFixed(1)}.`,statType:'RECENT_MARGIN',sample:last5.length,window:`LAST_${last5.length}`,priority:45}));
  }
  const s=streak(all);if(s&&s.n>=2)out.push(tidbit({gameId:game.id,scope:'TEAM',subject:team,text:`${team} enters on a ${s.n}-game ${s.side==='W'?'winning':'losing'} streak from its most recent completed games.`,statType:'CURRENT_STREAK',sample:s.n,window:'CURRENT_STREAK',priority:58}));
  return out;
}

function h2hCandidates(game,history){
  const teams=[game.home,game.away];
  const hs=history.filter(g=>teams.includes(g.home)&&teams.includes(g.away)).slice(-5);
  if(!hs.length)return [];
  const out=[];
  const homeRows=hs.map(g=>teamGame(g,game.home)).filter(Boolean);
  const su=rec(homeRows,'SU'),ats=rec(homeRows,'ATS'),ou=rec(homeRows,'OU');
  out.push(tidbit({gameId:game.id,scope:'MATCHUP',subject:`${game.away}@${game.home}`,text:`${game.home} is ${fmtRec(su,'SU')} against ${game.away} across their last ${su.g} meetings.`,statType:'HEAD_TO_HEAD',sample:su.g,window:`LAST_${su.g}_MEETINGS`,priority:70}));
  if(ats.g>=3)out.push(tidbit({gameId:game.id,scope:'MATCHUP',subject:`${game.away}@${game.home}`,text:`${game.home} is ${fmtRec(ats,'ATS')} ATS against ${game.away} across their last ${ats.g} lined meetings.`,statType:'HEAD_TO_HEAD_ATS',sample:ats.g,window:`LAST_${ats.g}_MEETINGS`,priority:68}));
  if(ou.g>=3)out.push(tidbit({gameId:game.id,scope:'MATCHUP',subject:`${game.away}@${game.home}`,text:`The last ${ou.g} lined ${game.away}-${game.home} meetings are ${fmtRec(ou,'OU')}.`,statType:'HEAD_TO_HEAD_OU',sample:ou.g,window:`LAST_${ou.g}_MEETINGS`,priority:64}));
  return out;
}

function select(cands,max){
  const seen=new Set(),out=[];
  const sorted=[...cands].sort((a,b)=>b._priority-a._priority||b.sample_size-a.sample_size||a.text.localeCompare(b.text));
  for(const x of sorted){
    const familySubject=`${x.stat_type}:${x.subject}`;
    if(seen.has(familySubject))continue;
    seen.add(familySubject);delete x._priority;out.push(x);if(out.length>=max)break;
  }
  return out;
}

function synthetic(){
  const hist=[];for(let i=1;i<=6;i++)hist.push({id:`2025_${String(i).padStart(2,'0')}_A_X${i}`,season:2025,week:i,game_type:'REG',home:i%2?'A':`X${i}`,away:i%2?`X${i}`:'A',hs:i%2?24:17,as:i%2?17:20,spread:3,total:44});
  hist.push({id:'2025_10_A_B',season:2025,week:10,game_type:'REG',home:'A',away:'B',hs:27,as:20,spread:3,total:43});
  hist.push({id:'2025_12_B_A',season:2025,week:12,game_type:'REG',home:'B',away:'A',hs:21,as:24,spread:1,total:42});
  const game={id:'2026_01_B_A',season:2026,week:1,game_type:'REG',home:'A',away:'B',hs:null,as:null,spread:null,total:null};
  return {rows:[...hist,game],game};
}

async function main(){
  const self=process.argv.includes('--self-test');const c=JSON.parse(fs.readFileSync(CONTRACT,'utf8'));
  const rows=self?synthetic().rows:await loadRows();
  const history=rows.filter(g=>g.game_type==='REG'&&c.source.history_window.includes(g.season)&&g.hs!=null&&g.as!=null)
    .sort((a,b)=>a.season-b.season||a.week-b.week||a.id.localeCompare(b.id));
  const upcoming=rows.filter(g=>g.game_type==='REG'&&g.season===c.source.current_schedule_season&&g.hs==null&&g.as==null&&g.home&&g.away);
  const firstWeek=upcoming.length?Math.min(...upcoming.map(g=>g.week)):null;
  const games=upcoming.filter(g=>g.week===firstWeek);
  const payload={schema_version:'1.0.0',status:games.length?'SHADOW_INTERFACE_CONTEXT_ONLY':'WAITING_FOR_2026_SCHEDULE',generated_at:self?'2026-09-01T00:00:00Z':new Date().toISOString(),season:2026,week:firstWeek,production_numeric_authority:0,actionable:false,games:{}};
  for(const g of games){const cands=[...teamCandidates(g,g.away,history),...teamCandidates(g,g.home,history),...h2hCandidates(g,history)];payload.games[g.id]={game_id:g.id,week:g.week,away_team:g.away,home_team:g.home,tidbits:select(cands,c.interface_contract.max_default_tidbits_per_game)};}
  const blocked=[];
  if(self){const g=Object.values(payload.games)[0];if(!g)blocked.push('synthetic game missing');if(g?.tidbits?.some(x=>x.descriptive_only!==true))blocked.push('descriptive-only flag missing');if(g?.tidbits?.some(x=>!x.text||!x.stat_type))blocked.push('required tidbit fields missing');if(g?.tidbits?.length>8)blocked.push('max tidbit limit failed');}
  if(!self){fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(payload,null,2)+'\n');}
  console.log(JSON.stringify({result:blocked.length?'BLOCKED':'PASS',history_games:history.length,current_week:firstWeek,current_games:games.length,tidbits:Object.values(payload.games).reduce((s,g)=>s+g.tidbits.length,0),blocked},null,2));
  if(blocked.length)process.exit(1);
}
await main();
