const norm=s=>String(s||'').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
const team=x=>({LAR:'LA',WSH:'WAS',JAC:'JAX'}[x]||x);
const decode=s=>String(s||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&#(?:39|x27);|&apos;/gi,"'").replace(/&amp;/g,'&').replace(/&quot;/g,'"').trim();
const positions={'Injured Quarterbacks':'QB','Injured Running Backs':'RB','Injured Wide Receivers':'WR','Injured Tight Ends':'TE'};
export function parseFantasyProsInjuries(html,season,week,canonical){
  const year=html.match(/\byear:\s*(\d{4})/);
  if(!year||Number(year[1])!==season)throw Error('FantasyPros injury season missing or mismatched');
  const byName=new Map(),out=new Map();for(const p of canonical){const key=norm(p.name),rows=byName.get(key)||[];rows.push(p);byName.set(key,rows);}let sourceRows=0;
  for(const [,table] of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)){
    const caption=decode(table.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i)?.[1]);
    const position=positions[caption],reserve=caption==='Players on Injured Reserve';if(!position&&!reserve)continue;
    for(const [,row]of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
      const cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1]);if(cells.length<2)continue;
      const name=decode(cells[0].match(/<a\b[^>]*href="\/nfl\/players\/[^"<>]+"[^>]*>([\s\S]*?)<\/a>/i)?.[1]),abbr=team(decode(cells[0].match(/<small\b[^>]*>([\s\S]*?)<\/small>/i)?.[1]));
      if(!name||!abbr)continue;sourceRows++;const matches=(byName.get(norm(name))||[]).filter(p=>p.team===abbr&&(!position||p.position===position));if(matches.length!==1)continue;const p=matches[0];
      if(reserve&&!decode(cells[1]).split(',').map(x=>Number(x.trim())).includes(week))continue;
      const status=reserve?'IR':decode(cells[1]);if(!/^(questionable|doubtful|out|ir|pup|suspended)$/i.test(status))throw Error('Unknown FantasyPros injury designation: '+status);
      const record={name:p.name,team:abbr,position:p.position,status,body_part:reserve?null:decode(cells[2])||null,source_updated_at:null,source_url:'https://www.fantasypros.com/nfl/players/injuries.php',source_date_available:false};
      const old=out.get(norm(p.name));if(!old||reserve)out.set(norm(p.name),record);
    }
  }
  if(sourceRows<10)throw Error('FantasyPros injury table coverage is incomplete');
  return {source_rows:sourceRows,records:[...out.values()]};
}
