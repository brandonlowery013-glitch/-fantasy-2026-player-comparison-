const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'};
export async function onRequestGet(){
 try{
  const r=await fetch('https://ctd-background-splits.brandonlowery013.workers.dev/availability/latest.json',{signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error('Background availability HTTP '+r.status);
  const data=await r.json(),age=Date.now()-Date.parse(data.observed_at);
  return Response.json({...data,health:{status:age>=0&&age<=30*60000?data.status:'STALE',last_success_at:data.observed_at}},{headers});
 }catch(e){return Response.json({status:'UNAVAILABLE',games:[],injuries:[],error:e.message},{status:502,headers});}
}
