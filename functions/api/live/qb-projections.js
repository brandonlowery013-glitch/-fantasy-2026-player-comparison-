export async function onRequestGet({request}){
 const url=new URL(request.url),history=url.searchParams.get('history'),verify=url.searchParams.get('verify');
 let path='/quarterbacks/latest.json';
 if(verify){if(!/^[A-Z]{2,3}$/.test(verify))return Response.json({error:'Invalid team'},{status:400});path='/quarterbacks/verify.json?team='+verify;}
 else if(history==='index')path='/quarterbacks/index.json';
 else if(history){if(!/^[a-f0-9]{64}$/.test(history))return Response.json({error:'Invalid revision'},{status:400});path='/quarterbacks/history/'+history+'.json';}
 try{const r=await fetch('https://ctd-background-splits.brandonlowery013.workers.dev'+path,{signal:AbortSignal.timeout(20000)});return new Response(r.body,{status:r.status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}catch(e){return Response.json({status:'UNAVAILABLE',error:e.message},{status:502,headers:{'cache-control':'no-store'}});}
}
