import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const contract=read('data/sources/nfl-event-ingestion-2026.json');
const foundation=read('data/sources/model-foundation-contract-2026.json');
const guardrails=read('guardrails/guardrails-config.json');
const ledger=read(contract.outputs.event_ledger);
const state=read(contract.outputs.current_state);
const blocked=[];
const req=foundation.foundation_layers.event_state_change.required_event_fields||[];
if(contract.mode!=='TRIGGER_ONLY'||contract.actionable!==false) blocked.push('event ingestion must remain trigger-only/non-actionable');
if(Number(guardrails.authoritative_player_shards)!==14) blocked.push('authoritative shard count is not 14');
if(Number(guardrails.authoritative_player_count)!==166) blocked.push('authoritative player count is not 166');
for(const e of ledger.events||[]){
  for(const k of req) if(!(k in e)) blocked.push(`${e.event_id||'event'} missing ${k}`);
  for(const k of ['o','tr','tp','pr','projection','weekly_projection','season_projection','market_value','betting_recommendation']) if(k in e) blocked.push(`${e.event_id} contains prohibited output ${k}`);
  if(!contract.supported_event_types.includes(e.event_type)) blocked.push(`${e.event_id} unsupported event type ${e.event_type}`);
}
const ids=(ledger.events||[]).map(e=>e.event_id);
if(new Set(ids).size!==ids.length) blocked.push('duplicate event ids');
if(state.season!==2026||ledger.season!==2026) blocked.push('season mismatch');
if(!contract.state_rules.first_observation_is_baseline_not_event) blocked.push('first observation baseline safeguard missing');
if(!contract.state_rules.source_failure_never_means_player_removed_or_active) blocked.push('source failure safeguard missing');
if(!contract.state_rules.return_does_not_restore_prior_workload_automatically) blocked.push('return workload safeguard missing');
if(!contract.state_rules.backup_is_never_promoted_automatically) blocked.push('automatic backup promotion safeguard missing');
if(!contract.prohibitions.some(x=>x.includes('may not write Overall rank'))) blocked.push('rank/projection prohibition missing');
console.log(JSON.stringify({generated_at:new Date().toISOString(),result:blocked.length?'BLOCKED':'PASS',status:contract.status,mode:contract.mode,actionable:contract.actionable,authoritative_player_count:guardrails.authoritative_player_count,authoritative_player_shards:guardrails.authoritative_player_shards,event_count:(ledger.events||[]).length,blocked},null,2));
if(blocked.length) process.exit(1);
