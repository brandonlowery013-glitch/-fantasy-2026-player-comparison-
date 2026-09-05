import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const ledgerPath=path.join(root,'guardrails/current-football-review.json');
const summaryPath=path.join(root,'guardrails/live-full-universe-review-summary.json');
const ledger=JSON.parse(fs.readFileSync(ledgerPath,'utf8'));
const textNorm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();

async function getHtml(url){const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; Fantasy2026Review/2.2)','accept':'text/html,application/xhtml+xml','accept-language':'en-US,en;q=0.9'}});if(!r.ok)throw new Error(`${url} -> ${r.status}`);return r.text();}
function decodeJsonString(raw){try{return JSON.parse(`"${raw.replace(/"/g,'\\"')}"`);}catch{return raw.replace(/\\n/g,' ').replace(/\\r/g,' ').replace(/\\t/g,' ').replace(/\\u0026/g,'&').replace(/\\u0027/g,"'").replace(/\\u0022/g,'"').replace(/\\\//g,'/');}}
function extractArticleBody(html){
  for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{
      const data=JSON.parse(m[1]);
      const nodes=Array.isArray(data)?data:[data];
      const stack=[...nodes];
      while(stack.length){const x=stack.shift();if(!x||typeof x!=='object')continue;if(typeof x.articleBody==='string'&&x.articleBody.trim())return x.articleBody;if(Array.isArray(x['@graph']))stack.push(...x['@graph']);}
    }catch{}
  }
  const m=html.match(/"articleBody"\s*:\s*"((?:\\.|[^"\\])*)"/i);
  return m?decodeJsonString(m[1]):null;
}

const mentions=[];
for(const p of ledger.players||[])for(const m of p.news_mentions||[])if(m?.source==='NFL.com'&&m?.url)mentions.push(m);
for(const p of ledger.materially_implicated_untracked||[])for(const m of p.news_mentions||[])if(m?.source==='NFL.com'&&m?.url)mentions.push(m);
const urls=[...new Set(mentions.map(m=>m.url))];
const bodies=new Map(),failures=[];let structured=0,headerOnly=0;
for(let i=0;i<urls.length;i+=8){const batch=urls.slice(i,i+8);const rs=await Promise.all(batch.map(async url=>{try{const html=await getHtml(url);const body=extractArticleBody(html);return[url,body];}catch(e){failures.push(`${url}: ${e.message}`);return[url,null];}}));for(const[url,body]of rs){if(body&&textNorm(body)){bodies.set(url,textNorm(body));structured++;}else{bodies.set(url,'');headerOnly++;}}}
function normalizeMention(m){if(m?.source!=='NFL.com'||!m?.url)return m;const body=bodies.get(m.url)||'';return{...m,body_text:body,nfl_body_mode:body?'STRUCTURED_ARTICLE_BODY':'HEADLINE_DESCRIPTION_ONLY'};}
for(const p of ledger.players||[]){p.news_mentions=(p.news_mentions||[]).map(normalizeMention);p.material_news_signals=(p.material_news_signals||[]).map(normalizeMention);}
for(const p of ledger.materially_implicated_untracked||[]){p.news_mentions=(p.news_mentions||[]).map(normalizeMention);p.material_news_signals=(p.material_news_signals||[]).map(normalizeMention);}
ledger.source_quality={...(ledger.source_quality||{}),nfl_unique_article_urls:urls.length,nfl_structured_article_bodies:structured,nfl_header_description_only:headerOnly,nfl_structured_body_fetch_failures:failures.length};
ledger.source_limitations=[...(ledger.source_limitations||[]).filter(x=>!String(x).includes('NFL.com current-news index/article coverage')),'NFL.com materiality uses structured articleBody when available; rendered page/navigation/related-story text is never eligible evidence. If structured articleBody is unavailable, only headline and description are eligible.'];
fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');
if(fs.existsSync(summaryPath)){const summary=JSON.parse(fs.readFileSync(summaryPath,'utf8'));summary.source_quality=ledger.source_quality;summary.source_limitations=ledger.source_limitations;fs.writeFileSync(summaryPath,JSON.stringify(summary,null,2)+'\n');}
console.log(JSON.stringify({result:'PASS',nfl_urls:urls.length,structured_article_bodies:structured,headline_description_only:headerOnly,fetch_failures:failures.length},null,2));
