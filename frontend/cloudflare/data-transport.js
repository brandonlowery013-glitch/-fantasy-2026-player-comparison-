(()=>{
 if(window.CTD_FETCH_TRANSPORT)return;window.CTD_FETCH_TRANSPORT=true;
 const original=window.fetch.bind(window),root='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/';
 window.fetch=(input,options)=>{
  const source=typeof input==='string'?input:input instanceof URL?input.href:null;
  if(source?.startsWith(root)){
   const u=new URL(source),path=u.pathname.slice(new URL(root).pathname.length);
   input='/cloudflare/api/published/'+path+u.search;
  }
  return original(input,options);
 };
})();
