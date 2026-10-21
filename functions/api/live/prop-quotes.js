const PUBLIC_KEY={kty:'OKP',crv:'Ed25519',x:'40ewA7-iqldZssgmurQ_ybfYNrB15aqCMLe1HbUrlfM',ext:true,key_ops:['verify']};
const MARKETS=new Set(['player_pass_yds','player_pass_tds','player_rush_yds','player_rush_tds','player_reception_yds','player_reception_tds','player_receptions']);
const deny=status=>Response.json({error:'Unauthorized prop collection request'},{status,headers:{'cache-control':'no-store'}});
export async function refreshProps({request,env},publicKey=PUBLIC_KEY){
 if(request.method!=='POST')return deny(405);
 if(!env.SPLITS_SCHEDULER||!env.ODDS_API_KEY)return Response.json({error:'Prop collection is not configured'},{status:503});
 const body=await request.text(),signature=request.headers.get('x-ctd-signature')||'';if(body.length>4096)return deny(401);
 let data;try{
  data=JSON.parse(body);const key=await crypto.subtle.importKey('jwk',publicKey,{name:'Ed25519'},false,['verify']);
  if(!await crypto.subtle.verify('Ed25519',key,Uint8Array.from(atob(signature),c=>c.charCodeAt(0)),new TextEncoder().encode(body)))return deny(401);
  if(!Number.isFinite(data.scheduled_time)||Math.abs(Date.now()-data.scheduled_time)>300000)return deny(401);
 }catch{return deny(401);}
 const events=data.path==='/v4/sports/americanfootball_nfl/events',odds=/^\/v4\/sports\/americanfootball_nfl\/events\/[a-f0-9]{32}\/odds$/.test(data.path||'');
 if(!events&&!odds)return deny(400);
 const params=data.params||{};if(Object.keys(params).some(k=>!['dateFormat','oddsFormat','regions','markets'].includes(k))||params.dateFormat!=='iso'||odds&&(params.regions!=='us'||params.oddsFormat!=='american'||!String(params.markets).split(',').every(k=>MARKETS.has(k))))return deny(400);
 const claim=await env.SPLITS_SCHEDULER.fetch(new Request('https://collector/props/claim',{method:'POST',headers:{'x-ctd-signature':signature},body}));if(!claim.ok)return deny(claim.status);
 const url=new URL('https://api.the-odds-api.com'+data.path);for(const [k,v]of Object.entries(params))url.searchParams.set(k,v);url.searchParams.set('apiKey',env.ODDS_API_KEY);
 try{const provider=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{accept:'application/json'}});const headers=new Headers({'content-type':'application/json','cache-control':'no-store'});for(const h of ['x-requests-remaining','x-requests-last','x-requests-used'])if(provider.headers.has(h))headers.set(h,provider.headers.get(h));if(!provider.ok)return Response.json({error:'Prop provider unavailable',provider_status:provider.status},{status:provider.status,headers});return new Response(provider.body,{status:provider.status,headers});}catch{return Response.json({error:'Prop provider timed out'},{status:502});}
}
export async function onRequestGet({request,env}){
 if(!env.SPLITS_SCHEDULER)return Response.json({error:'Background prop collection unavailable'},{status:503});
 const history=new URL(request.url).searchParams.get('history');if(history!==null&&history!=='index'&&!/^\d{13}$/.test(history))return Response.json({error:'Invalid capture ID'},{status:400});
 const path=history===null?'latest.json':history==='index'?'index.json':'history/'+history+'.json';
 const response=await env.SPLITS_SCHEDULER.fetch(new Request('https://collector/props/'+path));return new Response(response.body,{status:response.status,headers:{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'*'}});
}
