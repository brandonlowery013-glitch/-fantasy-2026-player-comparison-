// Public football-source reads: bounded retries, no fabricated/stale roster fallback.
export async function footballJson(url,{fetcher=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms)),attempts=3,timeoutMs=15000}={}) {
  let last;
  for(let attempt=0;attempt<attempts;attempt++) {
    try {
      const response=await fetcher(url,{headers:{'user-agent':'fantasy-2026-context-adapter'},signal:AbortSignal.timeout(timeoutMs)});
      if(response.ok)return await response.json();
      const error=new Error(`${url} -> ${response.status}`);error.status=response.status;
      await response.body?.cancel();
      if(![404,408,425,429].includes(response.status)&&response.status<500)throw Object.assign(error,{permanent:true});
      throw error;
    }catch(error){last=error;if(error.permanent||attempt===attempts-1)throw error;await wait(500*2**attempt);}
  }
  throw last;
}
export async function footballRoster(id,abbr,options={}) {
  const base='https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/';
  const urls=[`${base}${encodeURIComponent(id)}/roster`,`${base}${encodeURIComponent(abbr.toLowerCase())}/roster?season=2026`];
  let last;
  for(const url of urls){try{return {payload:await footballJson(url,options),url};}catch(error){last=error;if(error.permanent)throw error;}}
  throw last;
}
