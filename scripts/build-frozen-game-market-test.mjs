import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {simulateGameDistribution,moneylineProbabilities,outcomeProbabilities} from '../lib/game-market-probability.mjs';import {fairTwoWayAmerican} from '../lib/fair-market-probability.mjs';
const out='../../outputs/';const protocolRaw=fs.readFileSync(out+'revised-moneyline-spread-test.json'),protocol=JSON.parse(protocolRaw),capture=JSON.parse(fs.readFileSync(out+'prospective-game-market-test-inputs.json'));
assert.equal(capture.protocol_sha256,crypto.createHash('sha256').update(protocolRaw).digest('hex'));
const file=out+'frozen-prospective-game-market-predictions.json';assert(!fs.existsSync(file),'Never overwrite frozen predictions');const rows=[],excluded=[...capture.excluded];
const hasHold=x=>x&&typeof x==='object'&&(x.decision==='WAIT'||Object.values(x).some(hasHold));
for(const r of capture.rows){
 const time=Date.now();if(time>=Date.parse(r.kickoff)){excluded.push({game_id:r.game_id,market:r.market,reason:'KICKOFF_PASSED_BEFORE_FREEZE'});continue;}
 if(r.polymarket_book.bid_ask_spread>.1){excluded.push({game_id:r.game_id,market:r.market,reason:'WIDE_ORDER_BOOK'});continue;}
 const ml=r.market==='moneyline',g=r.game,q=r.quote,draws=simulateGameDistribution(r.game_id,g),p=ml?moneylineProbabilities(draws,'HOME'):outcomeProbabilities(draws.map(d=>d.margin),-r.home_line,'OVER');
 const football=ml?g.model.home_win_probability/(g.model.home_win_probability+g.model.away_win_probability):p.conditional_win_probability,push=ml?g.model.tie_probability:p.push_probability;
 const poly=(r.polymarket_book.midpoint-.5*push)/(1-push);if(!(poly>0&&poly<1))continue;
 const fair=fairTwoWayAmerican(ml?q.home_moneyline:q.home_spread_price,ml?q.away_moneyline:q.away_spread_price),w=protocol.results[r.market].frozen_future_weights;
 const combined=w.football*football+w.book*fair.fair_side_a_probability+w.poly*poly;const freeze=new Date().toISOString();
 rows.push({game_id:r.game_id,market:r.market,kickoff:r.kickoff,home_line:r.home_line,home_team:g.home_team,away_team:g.away_team,frozen_at:freeze,football_probability:football,sportsbook_probability:fair.fair_side_a_probability,polymarket_probability:poly,revised_probability:combined,weights:{football:w.football,book:w.book,poly:w.poly},source_commit:capture.source_commit,quote_snapshot_id:q.snapshot_id,quote_at:q.captured_at,polymarket_at:r.polymarket_book.timestamp,polymarket_bid:r.polymarket_book.best_bid,polymarket_ask:r.polymarket_book.best_ask,existing_qb_or_status_hold:!!hasHold(r.existing_market_state),outcome:null,mode:'RESEARCH_ONLY',actionable:false});
}
const result={schema_version:1,frozen_at:new Date().toISOString(),protocol_sha256:capture.protocol_sha256,rows,excluded,production_numeric_authority:0,original_picks_changed:false,settlement_rule:'Use verified final home-minus-away margin; spread home_line applies to home side; pushes/ties separated; compare all methods on identical games; never refit these weights after seeing these outcomes',status:'FROZEN_BEFORE_KICKOFF_AWAITING_RESULTS'};fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({predictions:rows.length,games:new Set(rows.map(r=>r.game_id)).size,markets:rows.reduce((a,r)=>(a[r.market]=(a[r.market]||0)+1,a),{}),holds:rows.filter(r=>r.existing_qb_or_status_hold).length,excluded:excluded.length}));
