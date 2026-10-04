// Parse only DraftKings' publicly rendered table, never embedded paywalled data.
export const SOURCE='https://dknetwork.draftkings.com/draftkings-sportsbook-betting-splits/?tb_edate=n7days&tb_eg=88808&tb_page=1';
export const canon=s=>({WAS:'WSH',LA:'LAR',JAC:'JAX'}[s]||s);
const decode=s=>s.replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n)).replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&minus;/g,'−');
function tree(html){
 const root={children:[],text:''},stack=[root];
 for(const token of html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').match(/<[^>]*>|[^<]+/g)||[]){
  if(token.startsWith('</')){const tag=token.match(/^<\/([\w-]+)/)?.[1]?.toLowerCase();let i=stack.length-1;while(i>0&&stack[i].tag!==tag)i--;if(i>0)stack.length=i;}
  else if(/^<[a-z]/i.test(token)){const tag=token.match(/^<([\w-]+)/)[1].toLowerCase(),attrs={};for(const m of token.matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g))attrs[m[1]]=decode(m[2]);const n={tag,attrs,children:[],text:''};stack.at(-1).children.push(n);if(!/^(img|br|hr|input|meta|link|source|wbr)$/.test(tag)&&!token.endsWith('/>'))stack.push(n);}
  else if(!token.startsWith('<'))stack.at(-1).text+=decode(token);
 }return root;
}
const text=n=>(n.text+' '+n.children.map(text).join(' ')).replace(/\s+/g,' ').trim();
const has=(n,c)=>(n.attrs?.class||'').split(/\s+/).includes(c);
const find=(n,p)=>n.children.flatMap(c=>[...(p(c)?[c]:[]),...find(c,p)]);
const pct=s=>/^\d+(?:\.\d+)?%$/.test(s)?Number(s.slice(0,-1)):NaN;
export function parseSplits(html,events,observedAt){
 if(!Number.isFinite(Date.parse(observedAt)))throw Error('Missing observation time');
 const games=[];
 for(const event of find(tree(html),n=>has(n,'tb-se'))){
  const title=find(event,n=>has(n,'tb-se-title'))[0];if(!title)continue;
  let logos=find(title,n=>n.tag==='img').map(n=>n.attrs.src.match(/\/teams\/nfl\/([A-Z]+)\.png/)?.[1]).filter(Boolean).map(canon);
  const heading=find(title,n=>has(n,'tb-se-title-new'))[0];if(heading){const sides=text(heading).split(' @ ');if(sides.length===2)logos=sides.map(label=>/^NY Jets\b/.test(label)?'NYJ':/^NY Giants\b/.test(label)?'NYG':/^LA Chargers\b/.test(label)?'LAC':canon(label.split(' ')[0]));}
  const md=text(title).match(/(\d{1,2})\/(\d{1,2}),/);if(logos.length!==2||!md)continue;
  // A displayed month/day alone cannot establish a season. Bind to the actual schedule.
  const matches=events.filter(e=>{const teams=e.competitions?.[0]?.competitors||[],home=canon(teams.find(t=>t.homeAway==='home')?.team?.abbreviation),away=canon(teams.find(t=>t.homeAway==='away')?.team?.abbreviation);const date=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'numeric',day:'numeric'}).format(new Date(e.date));return home===logos[1]&&away===logos[0]&&date===`${+md[1]}/${+md[2]}`;});
  if(matches.length!==1)continue;
  const game={home:logos[1],away:logos[0],event_id:matches[0].id,start_at:matches[0].date,observed_at:observedAt,source:'DraftKings Sportsbook',source_url:SOURCE};
  const wrap=find(event,n=>has(n,'tb-market-wrap'))[0];if(!wrap)continue;
  for(const market of wrap.children){const head=find(market,n=>has(n,'tb-se-head'))[0];const name=head?.children[0]&&text(head.children[0]);const key={Moneyline:'moneyline',Spread:'spread',Total:'total'}[name];if(!key)continue;
   if(text(head.children[2]||{text:'',children:[]})!=='% Handle'||text(head.children[3]||{text:'',children:[]})!=='% Bets')continue;
   const rows=find(market,n=>has(n,'tb-sodd')).map(n=>{const cells=n.children;const label=cells[0]?text(cells[0]):'';return {side:key==='total'?label.match(/^(Over|Under)/i)?.[1]:(/^NY Jets\b/.test(label)?'NYJ':/^NY Giants\b/.test(label)?'NYG':/^LA Chargers\b/.test(label)?'LAC':canon(label.split(' ')[0])),label,odds:cells[1]?text(cells[1]):'',money:pct(cells[2]?text(cells[2]):''),bets:pct(cells[3]?text(cells[3]):'')};});
   if(rows.length!==2||!rows.every(r=>r.side&&[r.money,r.bets].every(v=>Number.isFinite(v)&&v>=0&&v<=100)))continue;
   if(!['money','bets'].every(k=>Math.abs(rows[0][k]+rows[1][k]-100)<=1))continue;
   if(new Set(rows.map(r=>r.side.toUpperCase())).size!==2)continue;
   if(key!=='total'&&!rows.every(r=>logos.includes(r.side)))continue;
   game[key]=rows;
  }
  if(game.moneyline||game.spread||game.total)games.push(game);
 }return {schema_version:1,observed_at:observedAt,source_url:SOURCE,games};
}
