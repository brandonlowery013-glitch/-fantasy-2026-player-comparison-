/* Refreshes update data without replacing the reader's place or disclosure state. */
(()=>{
  let depth=0;
  const choices=new Map();
  const restoredToggles=new WeakSet();
  const key=el=>el.id||el.getAttribute('data-profile')||el.getAttribute('data-board-name')||'';
  function disclosures(root){
    const counts=new Map();
    return [...root.querySelectorAll('details')].map(el=>{
      const card=el.closest('article');
      const identity=card?.querySelector('[data-profile],[data-board-name]');
      const label=(el.querySelector('summary')?.textContent||'').trim().replace(/\d+/g,'#');
      const base=[key(el),identity?key(identity):card?.querySelector('strong,h3')?.textContent||'',label].join('|');
      const ordinal=counts.get(base)||0;counts.set(base,ordinal+1);
      return {el,key:base+'|'+ordinal};
    });
  }
  function preserve(root,render){
    if(!root||depth)return render();
    depth++;
    const visible=!!root.getClientRects().length;
    const x=window.scrollX,y=window.scrollY;
    const prefix=(root.id||'document')+'|';
    const states=new Map(disclosures(root).map(({el,key})=>[key,choices.has(prefix+key)?choices.get(prefix+key):el.open]));
    const focus=root.contains(document.activeElement)?document.activeElement:null;
    const focusId=focus?.id;
    const selection=focus&&typeof focus.selectionStart==='number'?[focus.selectionStart,focus.selectionEnd]:null;
    const scrollers=[root,...root.querySelectorAll('[id],dialog,.ctdCompareScroll')].filter(el=>el.scrollTop||el.scrollLeft).map(el=>({el,id:el.id,top:el.scrollTop,left:el.scrollLeft}));
    try{return render();}
    finally{
      for(const {el,key} of disclosures(root)){
        const desired=choices.has(prefix+key)?choices.get(prefix+key):states.get(key);
        if(desired!==undefined&&el.open!==desired){restoredToggles.add(el);el.open=desired;}
      }
      for(const state of scrollers){const el=state.el.isConnected?state.el:state.id?document.getElementById(state.id):null;if(el){el.scrollTop=state.top;el.scrollLeft=state.left;}}
      const next=focus?.isConnected?focus:focusId?document.getElementById(focusId):null;
      if(next&&focus){next.focus({preventScroll:true});if(selection&&next.setSelectionRange)try{next.setSelectionRange(...selection);}catch{}}
      if(visible&&(window.scrollX!==x||window.scrollY!==y))window.scrollTo({left:x,top:y,behavior:'instant'});
      depth--;
    }
  }
  function remember(event){
    const detail=event.target;if(detail.tagName!=='DETAILS'||!detail.isConnected)return;
    if(restoredToggles.has(detail)){restoredToggles.delete(detail);return;}
    const root=detail.closest('.page')||detail.closest('#ctdNewsUpdates');if(!root)return;
    const found=disclosures(root).find(x=>x.el===detail);if(found)choices.set(root.id+'|'+found.key,detail.open);
  }
  document.addEventListener('toggle',remember,true);
  document.addEventListener('click',event=>{if(event.target.closest?.('[data-game-index]'))for(const key of choices.keys())if(key.startsWith('gamesPage|'))choices.delete(key);},true);
  window.CTD_READING={preserve};
})();
