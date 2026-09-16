import fs from 'node:fs';
export function snapshot(payload, now=Date.now()){
 if(!Array.isArray(payload.articles))throw Error('Missing articles');
 const articles=payload.articles.filter(a=>{try{const u=new URL(a.links?.web?.href),t=Date.parse(a.published);return u.protocol==='https:'&&(u.hostname==='espn.com'||u.hostname.endsWith('.espn.com'))&&typeof a.headline==='string'&&Number.isFinite(t)&&t<=now+300000&&now-t<=7*86400000}catch{return false}}).map(a=>({headline:a.headline.slice(0,300),description:String(a.description||'').slice(0,500),published:a.published,links:{web:{href:a.links.web.href}}}));
 if(!articles.length)throw Error('No recent valid articles');
 return {fetched_at:new Date(now).toISOString(),articles};
}
if(process.argv.includes('--self-test')){
 const a={headline:'Player injury update',published:new Date().toISOString(),links:{web:{href:'https://www.espn.com/nfl/story/_/id/1'}}};
 if(snapshot({articles:[a,{...a,links:{web:{href:'https://example.com'}}}]}).articles.length!==1)throw Error('Source gate failed');
 let rejected=false;try{snapshot({articles:[]})}catch{rejected=true}if(!rejected)throw Error('Empty feed accepted');
 console.log('News source/date/empty response checks passed');
}else{
 const response=await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=200',{headers:{accept:'application/json','user-agent':'ChuckTheDuke/2026'},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('News provider HTTP '+response.status);
 const data=snapshot(await response.json());
 fs.writeFileSync('/tmp/live-news.json',JSON.stringify(data));
 const base='https://api.github.com/repos/'+process.env.GITHUB_REPOSITORY+'/contents/data/live-news.json';
 const headers={authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'};
 const old=await fetch(base+'?ref=data/live-news',{headers});if(!old.ok)throw Error('News branch lookup failed '+old.status);
 const sha=(await old.json()).sha;
 const saved=await fetch(base,{method:'PUT',headers,body:JSON.stringify({message:'Refresh display-only football headlines',branch:'data/live-news',sha,content:Buffer.from(JSON.stringify(data)).toString('base64')})});
 if(!saved.ok)throw Error('News publish failed '+saved.status);
 console.log('Published '+data.articles.length+' current headlines');
}
