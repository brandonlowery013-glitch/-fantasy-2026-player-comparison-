// Published model JSON is produced and validated upstream. Forward it as bytes;
// never rebuild distributions or parse/stringify multi-megabyte feeds in Workers.
const encode=text=>new TextEncoder().encode(text);
export async function publishedFeed(url){
  let last;
  for(let attempt=0;attempt<2;attempt++){
    try{
      const response=await fetch(url,{headers:{accept:'application/json'},cf:{cacheTtl:20,cacheEverything:true},signal:AbortSignal.timeout(10000)});
      if(!response.ok||!response.body){const error=Error(`Published feed unavailable: ${response.status}`);error.status=response.status;throw error;}
      return response;
    }catch(error){
      last=error;
      if(attempt===0&&(!error.status||error.status===429||error.status>=500))await new Promise(resolve=>setTimeout(resolve,180));
      else throw error;
    }
  }
  throw last;
}
export function streamPublishedObject(fields,headers){
  const body=new ReadableStream({async start(controller){
    try{
      controller.enqueue(encode('{'));
      let first=true;
      for(const [key,value] of Object.entries(fields)){
        controller.enqueue(encode((first?'':',')+JSON.stringify(key)+':'));first=false;
        if(value instanceof Response){
          const reader=value.body.getReader();
          try{for(;;){const {done,value:chunk}=await reader.read();if(done)break;controller.enqueue(chunk);}}
          finally{reader.releaseLock();}
        }else controller.enqueue(encode(JSON.stringify(value)));
      }
      controller.enqueue(encode('}'));controller.close();
    }catch(error){controller.error(error);}
  }});
  return new Response(body,{headers});
}
