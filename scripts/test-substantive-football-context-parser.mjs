import assert from 'node:assert/strict';

const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
function parseDepth(payload){const rows=[];const seenObj=new WeakSet();const walk=(x,posHint='')=>{if(Array.isArray(x)){x.forEach((v,i)=>walk(v,posHint||String(i+1)));return;}if(!x||typeof x!=='object'||seenObj.has(x))return;seenObj.add(x);const pos=String(x.position?.abbreviation||x.position?.name||x.name||x.position||posHint||'').toUpperCase();const athletes=x.athletes||x.items;if(Array.isArray(athletes))athletes.forEach((a,i)=>{const athlete=a?.athlete||a;const name=athlete?.displayName||athlete?.fullName||athlete?.name;const explicit=Number(a?.rank??athlete?.rank);const rank=Number.isFinite(explicit)&&explicit>0?explicit:i+1;const p=String(athlete?.position?.abbreviation||pos||'').toUpperCase();const active=typeof athlete?.active==='boolean'?athlete.active:(typeof a?.active==='boolean'?a.active:null);if(name&&rank)rows.push({name,rank,position:p,active});});for(const v of Object.values(x))if(v&&typeof v==='object')walk(v,pos);};walk(payload.depthchart||payload.depthcharts||payload.items||payload);const seen=new Set();return rows.filter(r=>{const k=`${norm(r.name)}|${r.position}|${r.rank}`;if(seen.has(k))return false;seen.add(k);return true;});}

const currentShape={depthchart:[{position:{abbreviation:'RB'},athletes:[{displayName:'Alpha Back',position:{abbreviation:'RB'},active:true},{displayName:'Beta Back',position:{abbreviation:'RB'},active:true}]},{position:{abbreviation:'QB'},athletes:[{displayName:'Gamma QB',position:{abbreviation:'QB'},active:true}]}]};
const rows=parseDepth(currentShape);
assert.equal(rows.length,3);
assert.equal(rows.find(x=>x.name==='Alpha Back').rank,1);
assert.equal(rows.find(x=>x.name==='Beta Back').rank,2);
assert.equal(rows.find(x=>x.name==='Gamma QB').rank,1);

const explicitShape={depthcharts:[{position:'WR',athletes:[{athlete:{displayName:'Explicit WR',position:{abbreviation:'WR'}},rank:3}]}]};
const explicit=parseDepth(explicitShape);
assert.equal(explicit.length,1);
assert.equal(explicit[0].rank,3);

console.log(JSON.stringify({result:'PASS',array_order_rank_fallback:true,singular_depthchart_supported:true,plural_depthcharts_supported:true,explicit_rank_preserved:true},null,2));
