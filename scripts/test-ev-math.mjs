import assert from 'node:assert/strict';

const implied=o=>o<0?(-o)/((-o)+100):100/(o+100);
const profit=o=>o<0?100/(-o):o/100;
const devig=(over,under)=>{const po=implied(over),pu=implied(under),s=po+pu;return [po/s,pu/s]};
const ev=(p,odds)=>p*profit(odds)-(1-p);

{
  const [po,pu]=devig(-110,-110);
  assert.ok(Math.abs(po-0.5)<1e-12);
  assert.ok(Math.abs(pu-0.5)<1e-12);
}

{
  const result=ev(0.57,-110);
  assert.ok(Math.abs(result-0.0881818181818182)<1e-12);
}

{
  const [po,pu]=devig(-120,100);
  assert.ok(Math.abs((po+pu)-1)<1e-12);
  assert.ok(po>pu);
}

{
  const pOver=0.58,pUnder=0.42;
  assert.ok(Math.abs((pOver+pUnder)-1)<1e-12);
  assert.ok(ev(pOver,-110)>0);
}

console.log('EV/de-vig unit tests passed.');
