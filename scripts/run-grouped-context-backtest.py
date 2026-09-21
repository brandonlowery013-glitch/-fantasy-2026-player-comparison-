#!/usr/bin/env python3
import json
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1]
required=['data/probability/generated/game-team-scoring-priors-2023-2025.json','data/probability/generated/play-context-measures-2023-2026.json','data/probability/generated/travel-rest-context-2023-2026.json']
market_candidates=list((ROOT/'data').rglob('*'))
historical_market=[str(p) for p in market_candidates if p.is_file() and any(x in p.name.lower() for x in ['historical','odds','market','spread','consensus']) and '2026' not in p.name]
missing=[p for p in required if not (ROOT/p).exists()]
report={'generated_at':datetime.now(timezone.utc).isoformat(),'status':'BLOCKED_PENDING_HISTORICAL_MARKET_ARCHIVE','mode':'SHADOW_ONLY','market_layer_required':['opening_line','current_line','spread_price','total','moneyline','market_implied_probability','consensus_ticket_share','money_share','line_movement'],'required_inputs':required,'missing_inputs':missing,'historical_market_candidates':historical_market[:50],'reason':'The football context files exist, but no verified 2023-2025 pregame spread/total/moneyline archive with consensus and money-share timestamps was found. Betting accuracy cannot be calculated without it.','planned_variants':['market_only','market_plus_personnel','market_plus_offense_defense','market_plus_pace_red_zone','market_plus_field_position_special_teams','market_plus_travel_rest','full_grouped_model'],'promotion_status':'NO_PRODUCTION_CHANGE'}
out=ROOT/'guardrails/grouped-context-backtest-report.json';out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
