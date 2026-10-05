import {numeric,fitProduction,score} from './admission-model.mjs';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const median=xs=>{const a=xs.filter(numeric).map(Number).sort((a,b)=>a-b);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;};
const quantile=(xs,q)=>{const a=xs.filter(numeric).map(Number).sort((a,b)=>a-b);if(!a.length)return null;const p=(a.length-1)*clamp(q,0,1),lo=Math.floor(p),hi=Math.ceil(p);return lo===hi?a[lo]:a[lo]+(a[hi]-a[lo])*(p-lo);};

function tier(entry){
  const r=String(entry.reason||'').toLowerCase();
  if(/interim starter|named interim|during .* absence|while .* unavailable|fill-in starter|replacement starter/.test(r))return 'INTERIM_STARTER';
  if(Number(entry.depth_rank)===1||/current starter|starting role|starting quarterback|current receiving role|current target opportunity|active fantasy role/.test(r))return 'STARTER';
  if(Number(entry.depth_rank)===2||/committee|contingent|passing-down|alongside|complementary|opportunity/.test(r))return 'ROTATION';
  return 'CONTINGENT';
}

export function deriveAdmissionInput({effective,entry,input,now}){
  if(!input || input.calibration?.reviewed === true)return input;
  const review=input.roster_review||{},age=(Date.parse(now)-Date.parse(review.as_of))/86400000;
  if(review.status!=='ACTIVE_FANTASY_ROLE'||!review.source||!Number.isFinite(age)||age<0||age>7)return input;
  const peers=effective.filter(p=>p.p===entry.position&&numeric(p.r)&&numeric(p.mp)&&numeric(p.s));
  if(peers.length<6)return input;
  const t=tier(entry),q=t==='STARTER'?.55:t==='INTERIM_STARTER'?.40:t==='ROTATION'?.30:.20;
  const targetR=quantile(peers.map(p=>p.r),q);
  const cohort=peers.toSorted((a,b)=>Math.abs(a.r-targetR)-Math.abs(b.r-targetR)||a.tr-b.tr).slice(0,Math.min(12,peers.length));
  const reason=String(entry.reason||'').toLowerCase();
  let aq=.50;
  if(/season[- ]ending|injured reserve/.test(reason))aq=.15;
  else if(/\bout\b|unavailable|ankle|groin|finger|foot|hamstring|recovery/.test(reason))aq=.30;
  else if(/questionable|limited|injury/.test(reason))aq=.40;
  else if(/cleared|full practice|active-roster return|returned to the starting/.test(reason))aq=.55;
  const A=quantile(peers.map(p=>p.a),aq),peerA=median(cohort.map(p=>p.a))||A||8;
  let mp=median(cohort.map(p=>p.mp)); if(!numeric(mp))return input;
  mp=Math.max(0,Math.round(mp*clamp((A||peerA)/peerA,.65,1.05)*4)/4);
  const teammates=effective.filter(p=>p.t===entry.team);
  const components={pd:fitProduction(effective,entry.position,mp),ce:median(cohort.map(p=>p.ce)),r:targetR,e:median(teammates.map(p=>p.e))??median(cohort.map(p=>p.e)),a:A,rl:median(cohort.map(p=>p.rl)),su:median(cohort.map(p=>p.su))};
  if(Object.values(components).some(v=>!numeric(v)))return input;
  const s=score(components);
  const tv=[...effective].sort((a,b)=>b.s-a.s||a.tr-b.tr);let tr=tv.findIndex(p=>p.s<s);tr=(tr<0?tv.length:tr)+1;
  const nearest=peers.toSorted((a,b)=>Math.abs(a.s-s)-Math.abs(b.s-s)||a.tr-b.tr).slice(0,Math.min(12,peers.length));
  const overall=clamp(Math.round(tr+(median(nearest.map(p=>Number(p.o)-Number(p.tr)))||0)),1,effective.length+1);
  const src=review.source,method='CANONICAL_POSITION_ROLE_COHORT_V1';
  const comp=Object.fromEntries(Object.entries(components).map(([k,v])=>[k,{value:Number(Number(v).toFixed(3)),method,source:src}]));
  const rec=t==='STARTER'?'IN-SEASON WAIVER / ROLE TRACK':t==='INTERIM_STARTER'?'IN-SEASON STREAM / CONTINGENCY TRACK':t==='ROTATION'?'IN-SEASON CONTINGENCY ADD':'DEEP CONTINGENCY TRACK';
  return {...input,
    calibration:{...(input.calibration||{}),reviewed:true,method,source_run:input.calibration?.source_run||('full-development-sweep-'+now.slice(0,10)),review_note:'Admission-only calibration from current sourced football role and existing canonical positional peers; no ECR/ADP input.'},
    projection:input.projection?.mp!=null?input.projection:{mp,method,source:src},
    components:{...comp,...(input.components||{})},
    overall_rank:Number.isInteger(input.overall_rank)?input.overall_rank:overall,
    overall_review:input.overall_review?.method?input.overall_review:{method:'CANONICAL_POSITION_SCORE_GAP_OVERLAY_V1',source:src},
    writeup:{m:input.writeup?.m||('ROS median: '+mp.toFixed(1)+' PPR points from current '+t.toLowerCase().replaceAll('_',' ')+' peer calibration'),cl:input.writeup?.cl||('Ceiling is conditional on sustained role; calibrated ceiling component '+Number(components.ce).toFixed(2)+'/10.'),en:input.writeup?.en||('Team-environment component '+Number(components.e).toFixed(2)+'/10 is inherited from current canonical '+entry.team+' context.'),nm:input.writeup?.nm||entry.reason,na:input.writeup?.na||'ADMIT through the fluid-universe path; football-role calibration is independent of market ECR/ADP.',current_recommendation:input.writeup?.current_recommendation||rec},
    connected_review:Array.isArray(input.connected_review)&&input.connected_review.length?input.connected_review:teammates.map(p=>({player:p.n,decision:'HOLD',reason:entry.player_name+' admission changes membership/rank insertion only; no separate season-long component change is supported by this evidence.',source:src})),
    auto_calibration:{tier:t,peer_count:cohort.length,peer_names:cohort.map(p=>p.n),candidate_score:Number(s.toFixed(5)),estimated_true_value_insertion:tr,estimated_overall_insertion:overall,market_inputs_used:false}
  };
}
