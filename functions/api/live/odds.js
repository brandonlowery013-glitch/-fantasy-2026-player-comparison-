const SOURCE='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/main/data/market/current-game-lines-2026.json';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60'}});
export async function onRequestGet(){
  try{
    const response=await fetch(SOURCE,{signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('Published lines unavailable');
    const reader=response.body.getReader(),chunks=[];let size=0;
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2000000){await reader.cancel();throw Error('Feed too large');}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const data=JSON.parse(new TextDecoder().decode(bytes));
    if(!Array.isArray(data.games)||data.games.length>300||data.quote_type!=='pregame')throw Error('Invalid feed');
    return json(data);
  }catch{return json({status:'unavailable',games:[],message:'Published sportsbook lines are temporarily unavailable.'},503);}
}
