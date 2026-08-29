(()=>{
  const STYLE_ID='ui-step3-comparison-style';
  const NOTE_ID='ui-step3-decision-note';
  const css=`
    .verdicts{align-items:stretch;gap:14px}
    .verdict{position:relative;min-width:0;padding:16px 17px;background:linear-gradient(180deg,#0f1c31 0%,#0b1628 100%)}
    .verdict .label{font-size:11px;letter-spacing:.09em;color:#9fb4d4}
    .verdict .pick{font-size:clamp(21px,3vw,30px);line-height:1.08;margin:8px 0 9px;overflow-wrap:anywhere}
    .verdict .small{font-size:13px;line-height:1.55;color:#c7d5e9}
    .verdict:first-child{border-color:#42658f}
    .verdict:nth-child(2){border-color:#3b7253}
    .uiStep3DecisionNote{margin:12px 0 0;padding:11px 12px;border:1px solid #294a6c;border-radius:10px;background:#091526;color:#b7c8df;font-size:12px;line-height:1.5}
    .uiStep3DecisionNote b{color:#eef6ff}
    .decisionPair{margin-top:12px;gap:10px}
    .decisionChip{padding:12px 13px}
    .decisionChip span{font-size:9px;color:#8fa7c4}
    .decisionChip b{font-size:16px;line-height:1.25;overflow-wrap:anywhere}
    #details{margin-top:14px}
    .detail{margin-top:12px;padding:15px}
    .detailHead{align-items:flex-start}
    .detailHead h3{line-height:1.25}
    .compareRows{gap:10px}
    .compareCell{padding:12px}
    .metricBlock{padding:8px 0}
    .metricLabel{font-size:9px}
    .metric{line-height:1.5}
    .read{line-height:1.55}
    #cards.cards{gap:12px}
    .pcard{padding:13px}
    @media(max-width:760px){
      .verdicts{grid-template-columns:1fr}
      .decisionPair{grid-template-columns:1fr 1fr}
      .verdict{padding:14px}
      .verdict .pick{font-size:23px}
    }
    @media(max-width:440px){
      .decisionPair{grid-template-columns:1fr}
      .cards,.compareRows{grid-template-columns:1fr}
    }
  `;
  function enhance(){
    if(!document.getElementById(STYLE_ID)){
      const s=document.createElement('style');
      s.id=STYLE_ID;
      s.textContent=css;
      document.head.appendChild(s);
    }
    const verdicts=document.querySelector('.verdicts');
    if(verdicts){
      const labels=verdicts.querySelectorAll('.verdict .label');
      if(labels[0])labels[0].textContent='Better Player';
      if(labels[1])labels[1].textContent='Best Draft Value';
      if(!document.getElementById(NOTE_ID)){
        const n=document.createElement('div');
        n.id=NOTE_ID;
        n.className='uiStep3DecisionNote';
        n.innerHTML='<b>Two separate decisions:</b> Better Player answers who has the stronger football profile. Best Draft Value answers who is the better pick at the current market price.';
        verdicts.insertAdjacentElement('afterend',n);
      }
    }
    const chips=document.querySelectorAll('.decisionChip span');
    if(chips[0])chips[0].textContent='Football Edge';
    if(chips[1])chips[1].textContent='Price / ADP Edge';
    const snapshot=document.querySelector('#results .card:nth-of-type(2) h2');
    if(snapshot)snapshot.textContent='Side-by-Side Player Snapshot';
    document.documentElement.dataset.uiStep3='comparison-results';
  }
  function attach(){
    enhance();
    const root=document.getElementById('results')||document.body;
    const obs=new MutationObserver(()=>enhance());
    obs.observe(root,{childList:true,subtree:true});
    window.__UI_STEP3_COMPARISON_ATTACHED=true;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});
  else attach();
})();