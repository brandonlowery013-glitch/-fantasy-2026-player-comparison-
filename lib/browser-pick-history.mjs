// Keep the immutable audit ledger upstream; send only fields rendered by the UI.
const fields=['record_id','stream_id','game_id','season','week','revision','decision','selection','player','market','line','odds','book','captured_at'];
export function browserPickHistory(history,results){
 return {schema_version:1,history:{records:(history.records||[]).map(row=>Object.fromEntries(fields.filter(k=>k in row).map(k=>[k,row[k]])))},results:{events:results.events||{},settlements:(results.settlements||[]).map(row=>Object.fromEntries(['record_id','outcome','actual','profit_units'].filter(k=>k in row).map(k=>[k,row[k]])))}};
}
