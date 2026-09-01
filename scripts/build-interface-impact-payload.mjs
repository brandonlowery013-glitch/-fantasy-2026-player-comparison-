import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};
const contract=read('data/sources/interface-impact-payload-2026.json');
const events=read(contract.inputs.events);
const impacts=read(contract.inputs.connected_impacts);
const bridge=read(contract.inputs.team_scoring_market_bridge);

const byEvent=new Map((events.events||[]).map(e=>[e.event_id,e]));
const bridgeByEvent=new Map((bridge.cases||[]).map(c=>[c.source_event_id,c]));
const stateMap=contract.state_mapping||{};

function affectedPlayers(c){
  const out=[];
  const direct=c.direct_player||c.player||c.entity||null;
  if(direct)out.push({player:typeof direct==='string'?direct:(direct.player||direct.name||null),relationship:'DIRECT'});
  for(const x of c.connected_players||[]){
    const p=typeof x==='string'?x:(x.player||x.name||null);
    if(p&&!out.some(y=>y.player===p))out.push({player:p,relationship:'CONNECTED'});
  }
  return out.filter(x=>x.player);
}

function build(c){
  const e=byEvent.get(c.source_event_id)||{};
  const b=bridgeByEvent.get(c.source_event_id)||null;
  const rawState=b?.state||c.status||c.downstream_status||'PENDING_DOWNSTREAM_REASSESSMENT';
  const decision=stateMap[rawState]||'WAIT';
  const reason=b?.reason||c.reason||e.reason||`Downstream state: ${rawState}`;
  return {
    impact_id:c.case_id||`impact:${c.source_event_id}`,
    source_event_id:c.source_event_id,
    event_type:e.event_type||c.event_type||null,
    entity:e.entity_id_or_name||c.entity||c.direct_player||null,
    team:e.team||c.team||null,
    captured_at:e.captured_at||c.captured_at||null,
    materiality:e.materiality||c.materiality||null,
    state:rawState,
    affected_players:affectedPlayers(c),
    team_scoring:b?.football?{
      home_team:b.football.home_team??null,
      away_team:b.football.away_team??null,
      home_score_mean:b.football.home_score_mean??null,
      away_score_mean:b.football.away_score_mean??null,
      model_home_spread:b.football.model_home_spread??null,
      model_total:b.football.model_total??null
    }:null,
    market_comparison:b?.comparison||null,
    projection_change:null,
    rank_change:null,
    decision,
    reason,
    confidence:e.confidence??c.confidence??null,
    source:e.source||c.source||null
  };
}

function synthetic(){
  return [{case_id:'impact-self-test',source_event_id:'self-test-event',team:'TST',direct_player:'Test Player',connected_players:['Connected Player'],status:'PENDING_DOWNSTREAM_REASSESSMENT'}];
}

function validate(rows){
  const blocked=[];
  for(const r of rows){
    for(const f of contract.required_fields)if(!(f in r))blocked.push(`${r.impact_id||'unknown'} missing ${f}`);
    if(r.projection_change===0)blocked.push(`${r.impact_id} fabricated projection zero`);
    if(r.rank_change===0)blocked.push(`${r.impact_id} fabricated rank zero`);
    if(!['CHANGE','HOLD','WAIT','ADMIT','HOLD_OUT'].includes(r.decision))blocked.push(`${r.impact_id} invalid decision ${r.decision}`);
    if(!r.source_event_id)blocked.push(`${r.impact_id} missing source_event_id`);
  }
  return blocked;
}

function main(){
  const self=process.argv.includes('--self-test');
  let rows;
  if(self){
    const savedEvents=byEvent.get('self-test-event');
    byEvent.set('self-test-event',{event_id:'self-test-event',event_type:'AVAILABILITY_CHANGE',entity_id_or_name:'Test Player',team:'TST',captured_at:'2026-09-01T00:00:00Z',materiality:'HIGH',source:'SELF_TEST'});
    rows=synthetic().map(build);
    if(savedEvents)byEvent.set('self-test-event',savedEvents);else byEvent.delete('self-test-event');
  }else rows=(impacts.cases||[]).map(build);
  const blocked=validate(rows);
  if(self){
    if(rows.length!==1)blocked.push('self-test row count mismatch');
    if(rows[0]?.decision!=='WAIT')blocked.push('pending state did not map to WAIT');
    if(rows[0]?.affected_players?.length!==2)blocked.push('connected player expansion failed');
  }
  const output={schema_version:'1.0.0',season:2026,status:rows.length?'INTERFACE_IMPACTS_AVAILABLE':'AWAITING_MATERIAL_EVENTS',generated_at:self?'2026-09-01T00:00:00Z':new Date().toISOString(),impacts:rows};
  if(!self)write(contract.output,output);
  console.log(JSON.stringify({result:blocked.length?'BLOCKED':'PASS',impacts:rows.length,decisions:Object.fromEntries(['CHANGE','HOLD','WAIT','ADMIT','HOLD_OUT'].map(d=>[d,rows.filter(r=>r.decision===d).length])),blocked},null,2));
  if(blocked.length)process.exit(1);
}
main();
