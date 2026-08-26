(()=>{
  const clamp=x=>Math.max(0,Math.min(1,Number(x)));
  const score=p=>{
    const safety=(Number(p.a)*0.45+Number(p.rl)*0.35+Number(p.su)*0.20)/10;
    const parts=[Number(p.pd),Number(p.ce),Number(p.r),Number(p.e),Number(p.a),Number(p.rl),Number(p.su)];
    if(!parts.every(Number.isFinite)||!Number.isFinite(safety))throw new Error(`Incomplete Better Player inputs for ${p.n}`);
    return 0.35*clamp(Number(p.pd)/10)+0.20*clamp(Number(p.ce)/10)+0.15*clamp(Number(p.r)/10)+0.10*clamp(Number(p.e)/10)+0.20*clamp(safety);
  };
  const verdict=gap=>{const a=Math.abs(gap);return a<0.035?'TOSS_UP':a<0.09?'SLIGHT_EDGE':a<0.18?'EDGE':'CLEAR_EDGE'};
  const pretty={TOSS_UP:'Toss-up',SLIGHT_EDGE:'Slight edge',EDGE:'Edge',CLEAR_EDGE:'Clear edge'};
  const decision=ps=>{
    const ordered=[...ps].sort((a,b)=>score(b)-score(a));
    const gap=score(ordered[0])-score(ordered[1]);
    const band=verdict(gap);
    if(band==='TOSS_UP')return {ordered,gap,band,winner:null,label:'Toss-up',read:'Toss-up — the football-profile gap is too small to name a meaningful Better Player winner.'};
    return {ordered,gap,band,winner:ordered[0],label:ordered[0].n,read:`${pretty[band]} — ${ordered[0].n} has the stronger overall football profile across expected production, ceiling, risk, role and environment.`};
  };
  window.FANTASY2026_COMPARISON_RUNTIME={version:'STEP_6B_RUNTIME_1.0.0',score,verdict,decision,usesDraftPrice:false,usesSportsbook:false};
  function ready(){try{return typeof window.run==='function'&&typeof selected==='function'&&typeof vals==='function'}catch{return false}}
  function attach(){
    if(window.__STEP6B_RUNTIME_ATTACHED)return true;
    if(!ready())return false;
    const legacyRun=window.run;
    window.run=function(){
      legacyRun();
      const ps=selected();
      if(ps.length<2)return;
      const d=decision(ps);
      const valueOrdered=[...ps].sort((a,b)=>vals(b)-vals(a));
      document.getElementById('eq').textContent=d.label;
      document.getElementById('eqr').textContent=d.read;
      document.getElementById('straightEdge').textContent=d.label;
      document.getElementById('priceEdge').textContent=valueOrdered[0].n;
      const checked=[...document.querySelectorAll('.cb:checked')].map(x=>x.value);
      if(checked.includes('final')){
        const box=document.querySelector('#details .finalbox');
        if(box){
          const valueWinner=valueOrdered[0].n;
          const text=d.winner?(d.winner.n===valueWinner?`${d.winner.n} is the better player head to head and the better buy at current ADP.`:`${d.winner.n} is the better player head to head, but ${valueWinner} is the better buy at current ADP.`):`Better Player is a toss-up, while ${valueWinner} is the better buy at current ADP.`;
          box.innerHTML=`<b>Final Decision</b><div style="margin-top:6px">${text}</div>`;
        }
      }
    };
    window.__STEP6B_RUNTIME_ATTACHED=true;
    return true;
  }
  if(!attach()){
    let attempts=0;
    const timer=setInterval(()=>{attempts++;if(attach()||attempts>=200)clearInterval(timer)},25);
  }
})();
