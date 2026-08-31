import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const ref=read('data/probability/generated/historical-reference-population-2021-2025.json');
const prior=read('data/probability/generated/historical-uncertainty-priors-2021-2025.json');
const policy=read('data/probability/stat-distribution-policy.json');
const sourceOfTruth=read('MODEL_SOURCE_OF_TRUTH.json');
const guardrailConfig=read('guardrails/guardrails-config.json');
const authoritativeUniverse=Number(guardrailConfig.authoritative_player_count);
const modelUniverse=Number(sourceOfTruth.active_player_model);
const rows=ref.rows.filter(r=>r.played!==false).sort((a,b)=>a.season-b.season||a.week-b.week||String(a.player_id).localeCompare(String(b.player_id)));
const outDir=path.join(root,'data/probability/generated');fs.mkdirSync(outDir,{recursive:true});fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});
const tuneYears=new Set([2023,2024]), evalYear=2025, eps=1e-12;
const posStats={QB:['pass_attempts','pass_yards','pass_tds','rush_attempts','rush_yards','rush_tds'],RB:['rush_attempts','rush_yards','rush_tds','targets','receptions','receiving_yards','receiving_tds'],WR:['targets','receptions','receiving_yards','receiving_tds'],TE:['targets','receptions','receiving_yards','receiving_tds']};
const field={pass_attempts:'pass_attempts',pass_yards:'pass_yards',pass_tds:'pass_tds',rush_attempts:'rush_attempts',rush_yards:'rush_yards',rush_tds:'rush_tds',targets:'targets',receptions:'receptions',receiving_yards:'receiving_yards',receiving_tds:'receiving_tds'};
const kMap=prior.tuning;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const logGamma=z=>{const p=[676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.984369578019571e-6,1.5056327351493116e-7];if(z<.5)return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);z-=1;let x=.9999999999998099;for(let i=0;i<p.length;i++)x+=p[i]/(z+i+1);const t=z+p.length-.5;return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x)};
const normalLogPdf=(y,m,s)=>-.5*Math.log(2*Math.PI*s*s)-((y-m)**2)/(2*s*s);
const studentLogPdf=(y,m,s,df)=>{const scale=Math.max(1e-6,s*Math.sqrt((df-2)/df));const z=(y-m)/scale;return logGamma((df+1)/2)-logGamma(df/2)-.5*Math.log(df*Math.PI)-Math.log(scale)-((df+1)/2)*Math.log(1+z*z/df)};
const poisLogPmf=(y,lambda)=>{if(y<0||Math.floor(y)!==y)return -Infinity;lambda=Math.max(eps,lambda);return y*Math.log(lambda)-lambda-logGamma(y+1)};
const nbParams=(m,v)=>{m=Math.max(eps,m);v=Math.max(m+eps,v);const r=m*m/(v-m);const p=r/(r+m);return {r,p}};
const nbLogPmf=(y,m,v)=>{if(y<0||Math.floor(y)!==y)return -Infinity;const {r,p}=nbParams(m,v);return logGamma(y+r)-logGamma(r)-logGamma(y+1)+r*Math.log(p)+y*Math.log(1-p)};
const lognormalShiftLogPdf=(y,m,v,shift)=>{const x=y-shift;if(!(x>0))return -Infinity;const mx=Math.max(eps,m-shift),vx=Math.max(eps,v);const sig2=Math.log(1+vx/(mx*mx)),sig=Math.sqrt(sig2),mu=Math.log(mx)-sig2/2;return -Math.log(x*sig*Math.sqrt(2*Math.PI))-((Math.log(x)-mu)**2)/(2*sig2)};
const betaBinomLogPmf=(y,n,p,rho)=>{if(y<0||y>n||Math.floor(y)!==y||Math.floor(n)!==n)return -Infinity;rho=clamp(rho,1e-5,.95);p=clamp(p,1e-5,1-1e-5);const t=1/rho-1,a=p*t,b=(1-p)*t;return logGamma(n+1)-logGamma(y+1)-logGamma(n-y+1)+logGamma(y+a)+logGamma(n-y+b)-logGamma(n+a+b)+logGamma(a+b)-logGamma(a)-logGamma(b)};
const binomLogPmf=(y,n,p)=>{if(y<0||y>n||Math.floor(y)!==y||Math.floor(n)!==n)return -Infinity;p=clamp(p,1e-8,1-1e-8);return logGamma(n+1)-logGamma(y+1)-logGamma(n-y+1)+y*Math.log(p)+(n-y)*Math.log(1-p)};

class Acc{constructor(){this.n=0;this.sum=0;this.sumsq=0;this.zero=0;this.min=Infinity;this.targetSum=0;this.recSum=0;this.targetGames=0;this.rateSum=0;this.rateSq=0;}add(v,row,stat){if(Number.isFinite(v)){this.n++;this.sum+=v;this.sumsq+=v*v;if(v===0)this.zero++;if(v<this.min)this.min=v;}if(stat==='receptions'){const t=Number(row.targets),r=Number(row.receptions);if(Number.isFinite(t)&&Number.isFinite(r)&&t>0){const rate=r/t;this.targetSum+=t;this.recSum+=r;this.targetGames++;this.rateSum+=rate;this.rateSq+=rate*rate;}}}mean(){return this.n?this.sum/this.n:0}var(){return this.n>1?Math.max(0,(this.sumsq-this.sum*this.sum/this.n)/(this.n-1)):0}zeroRate(){return this.n?this.zero/this.n:0}rateMean(){return this.targetSum?this.recSum/this.targetSum:.5}rateRho(){if(this.targetGames<2)return .05;const m=this.rateSum/this.targetGames,v=Math.max(0,(this.rateSq-this.rateSum*this.rateSum/this.targetGames)/(this.targetGames-1));const denom=Math.max(eps,m*(1-m));return clamp(v/denom,.001,.5)}}

function familyGrid(stat){const fam=policy.stat_families[stat].candidate_families;const out=[];for(const f of fam){if(f==='student_t')for(const df of [3,5,8,15,30])out.push({family:f,df});else out.push({family:f});}return out}
function scoreFamily(c,y,row,state,mu,v){const f=c.family,s=Math.sqrt(Math.max(v,1e-6));if(f==='normal')return normalLogPdf(y,mu,s);if(f==='student_t')return studentLogPdf(y,mu,s,c.df);if(f==='lognormal_shifted'){const shift=(Number.isFinite(state.min)?state.min:0)-1;return lognormalShiftLogPdf(y,mu,v,shift)}if(f==='poisson')return poisLogPmf(y,Math.max(eps,mu));if(f==='negative_binomial')return nbLogPmf(y,Math.max(eps,mu),Math.max(mu+1e-6,v));if(f==='zero_inflated_negative_binomial'){const baseP0=Math.exp(nbLogPmf(0,Math.max(eps,mu),Math.max(mu+1e-6,v)));const obs0=state.zeroRate();const zi=clamp((obs0-baseP0)/Math.max(eps,1-baseP0),0,.95);if(y===0)return Math.log(Math.max(eps,zi+(1-zi)*baseP0));return Math.log(Math.max(eps,1-zi))+nbLogPmf(y,Math.max(eps,mu),Math.max(mu+1e-6,v));}if(f==='binomial_conditional_on_targets'){const n=Number(row.targets);if(!Number.isFinite(n))return null;return binomLogPmf(y,n,state.rateMean())}if(f==='beta_binomial'){const n=Number(row.targets);if(!Number.isFinite(n))return null;return betaBinomLogPmf(y,n,state.rateMean(),state.rateRho())}return null}

const tuneScores={}, evalScores={}, selected={};
for(const [pos,stats] of Object.entries(posStats)){
  tuneScores[pos]={};evalScores[pos]={};selected[pos]={};
  for(const stat of stats){
    const grid=familyGrid(stat), scores=new Map(grid.map(c=>[JSON.stringify(c),{...c,ll:0,n:0}]));
    const posAcc=new Acc(), playerAcc=new Map();const k=Number(kMap?.[pos]?.[stat]?.selected_k??5);
    for(const row of rows){if(row.position!==pos)continue;const y=Number(row[field[stat]]);if(!Number.isFinite(y))continue;let pa=playerAcc.get(row.player_id);if(!pa){pa=new Acc();playerAcc.set(row.player_id,pa)}
      if((tuneYears.has(row.season))&&posAcc.n>=50){const w=pa.n/(pa.n+k),mu=w*pa.mean()+(1-w)*posAcc.mean();const v=Math.max(1e-6,w*pa.var()+(1-w)*posAcc.var());for(const c of grid){const s=scoreFamily(c,y,row,pa.n?pa:posAcc,mu,v);if(Number.isFinite(s)){const rec=scores.get(JSON.stringify(c));rec.ll+=s;rec.n++;}}}
      pa.add(y,row,stat);posAcc.add(y,row,stat);
    }
    const arr=[...scores.values()].filter(x=>x.n>=100).map(x=>({...x,mean_log_score:x.ll/x.n})).sort((a,b)=>b.mean_log_score-a.mean_log_score);
    if(!arr.length)throw new Error(`No valid tuning family ${pos} ${stat}`);tuneScores[pos][stat]=arr;selected[pos][stat]=arr[0];

    const best=arr[0], es={...best,ll:0,n:0};const pos2=new Acc(), players2=new Map();
    for(const row of rows){if(row.position!==pos)continue;const y=Number(row[field[stat]]);if(!Number.isFinite(y))continue;let pa=players2.get(row.player_id);if(!pa){pa=new Acc();players2.set(row.player_id,pa)}
      if(row.season===evalYear&&pos2.n>=50){const w=pa.n/(pa.n+k),mu=w*pa.mean()+(1-w)*pos2.mean();const v=Math.max(1e-6,w*pa.var()+(1-w)*pos2.var());const s=scoreFamily(best,y,row,pa.n?pa:pos2,mu,v);if(Number.isFinite(s)){es.ll+=s;es.n++;}}
      pa.add(y,row,stat);pos2.add(y,row,stat);
    }
    evalScores[pos][stat]={family:best.family,df:best.df??null,sample:es.n,mean_log_score:es.n?es.ll/es.n:null};
  }
}

let evalN=0;const blocked=[];for(const [pos,stats] of Object.entries(evalScores))for(const [stat,r] of Object.entries(stats)){evalN+=r.sample;if(r.sample<100)blocked.push(`${pos} ${stat} eval sample <100`);if(!Number.isFinite(r.mean_log_score))blocked.push(`${pos} ${stat} invalid eval score`)}
if(!Number.isInteger(authoritativeUniverse)||authoritativeUniverse<=0)blocked.push('invalid authoritative player universe');
if(modelUniverse!==authoritativeUniverse)blocked.push('model source of truth does not match authoritative player universe');
if(ref.live_player_universe_count!==authoritativeUniverse)blocked.push('historical reference population does not match authoritative player universe');
if(ref.reference_unique_players<500)blocked.push('reference population too small');if(policy.market_price_prohibited_as_fit_input!==true)blocked.push('market contamination policy missing');
const generatedAt=new Date().toISOString();
const output={schema_version:'1.0.1',generated_at:generatedAt,mode:'SHADOW_ONLY',actionable:false,history_window:[2021,2022,2023,2024,2025],tuning_window:[2023,2024],evaluation_window:[2025],sportsbook_inputs_used:false,authoritative_player_universe:authoritativeUniverse,selection_rule:policy.selection_rule,selected_families:selected,tuning_scores:tuneScores,holdout_scores:evalScores,notes:['Candidate family is selected on 2023-2024 walk-forward log score and then frozen for 2025 evaluation.','Every prediction uses only games with an earlier season/week key.','Student-t degrees of freedom are selected only inside the tuning window.','Negative-binomial and zero-inflated models use only prior football outcomes to estimate dispersion/zero inflation.','Receptions conditional models use targets from the same observed player-game only for distribution-family diagnostic scoring; this is not yet a deployable pregame receptions model because future targets must themselves be forecast.','Sportsbook lines and prices are excluded from fitting and selection.','Live-universe integrity is checked against the authoritative guardrail count and MODEL_SOURCE_OF_TRUTH; an undeclared or unsynchronized universe change still blocks calibration.']};
const report={generated_at:generatedAt,result:blocked.length?'BLOCKED':'PASS',mode:'SHADOW_ONLY',actionable:false,total_2025_holdout_scores:evalN,sportsbook_inputs_used:false,authoritative_player_universe:authoritativeUniverse,reference_live_player_universe:ref.live_player_universe_count,model_source_of_truth_universe:modelUniverse,selected_families:Object.fromEntries(Object.entries(selected).map(([p,s])=>[p,Object.fromEntries(Object.entries(s).map(([st,x])=>[st,{family:x.family,df:x.df??null,tuning_mean_log_score:x.mean_log_score,tuning_sample:x.n}]))])),holdout_scores:evalScores,blocked};
fs.writeFileSync(path.join(outDir,'distribution-family-calibration-2021-2025.json'),JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(path.join(root,'guardrails/distribution-family-calibration-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({result:report.result,total_2025_holdout_scores:evalN,authoritative_player_universe:authoritativeUniverse,selected_families:report.selected_families,blocked},null,2));if(blocked.length)process.exit(1);
