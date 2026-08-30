import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const must=(ok,msg)=>{if(!ok)throw new Error(msg)};
const index=read('index.html');
const ops=read('operations-dashboard.html');
const contract=JSON.parse(read('data/sources/ui-permissions-step5-2026.json'));
const publicFiles=['index.html','compare.html','weekly-opportunities.html','operations-dashboard.html'];
const text=publicFiles.filter(fs.existsSync).map(read).join('\n');

must(contract.public_client_model==='READ_ONLY','Step 5 public client must be READ_ONLY');
must(contract.operations_surface?.write_authority===false,'Operations surface must have zero write authority');
must(contract.operations_surface?.credential_entry_allowed===false,'Public credential entry must be prohibited');
must(contract.operations_surface?.production_trigger_allowed===false,'Public production triggers must be prohibited');

must(!/href=["'][^"']*operations-dashboard\.html/i.test(index),'Operations dashboard must not be linked from primary public shell');
must(/read-only system view/i.test(ops),'Operations dashboard must explicitly identify itself as read-only');
must(!/<form\b/i.test(text),'Public client must not expose forms that can submit state');
must(!/method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i.test(text),'Public client contains a mutating fetch method');
must(!/\bfetch\s*\([^)]*\{[^}]*method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/is.test(text),'Public client contains mutating fetch authority');
must(!/workflow_dispatch|actions\/workflows\/.+dispatches|repository_dispatch/i.test(text),'Public client must not expose workflow trigger controls');
must(!/(github[_-]?token|personal[_-]?access[_-]?token|api[_-]?key|client[_-]?secret)\s*[=:]/i.test(text),'Public client must not embed credential material');
must(!/navigator\.(geolocation|mediaDevices|clipboard)|Notification\.requestPermission/i.test(text),'Public client requests browser capabilities outside Step 5 permission boundary');
must(!/<input[^>]+type=["']password["']/i.test(text),'Public client must not accept passwords or tokens');

const report={
  schema_version:'UI_PERMISSIONS_STEP5_REPORT_1.0.0',
  status:'PASS',
  public_client_model:'READ_ONLY',
  checked_files:publicFiles.filter(fs.existsSync),
  primary_navigation_operations_link:false,
  operations_surface:'PUBLIC_READ_ONLY_HEALTH_VIEW',
  mutation_methods_found:false,
  credential_entry_found:false,
  workflow_trigger_controls_found:false,
  browser_permission_requests_found:false,
  security_boundary:contract.security_boundary,
  next_gate:'STEP_6_RESPONSIVE_QA'
};
fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync('guardrails/ui-permissions-step5-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
