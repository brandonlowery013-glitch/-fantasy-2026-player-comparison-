export async function producerRef(repo,fetcher=fetch){
 const api=await fetcher('https://api.github.com/repos/'+repo+'/git/ref/heads/main',{headers:{accept:'application/json','user-agent':'CTD-background-producer/1.0'},signal:AbortSignal.timeout(20000)});if(api.ok){const sha=(await api.json()).object?.sha;if(/^[a-f0-9]{40}$/.test(sha||''))return sha;throw Error('Invalid producer reference');}
 if(![403,429].includes(api.status))throw Error('Producer reference HTTP '+api.status);
 const atom=await fetcher('https://github.com/'+repo+'/commits/main.atom',{headers:{accept:'application/atom+xml','user-agent':'CTD-background-producer/1.0'},signal:AbortSignal.timeout(20000)});if(!atom.ok)throw Error('Producer reference fallback HTTP '+atom.status);const xml=await atom.text(),sha=xml.match(/<id>tag:github\.com,2008:Grit::Commit\/([a-f0-9]{40})<\/id>/)?.[1];if(!sha)throw Error('Invalid pinned producer commit feed');return sha;
}
