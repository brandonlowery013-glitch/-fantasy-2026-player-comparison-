# Chuck The Duke Model — About / Model Identity

## What separates the model

Chuck The Duke is designed as a football-first decision system rather than a market-anchored ranking or betting tool.

The core flow is:

**football-first projection → uncertainty/distribution → contextual adjustment → market comparison → value decision → explanation**

The sportsbook market is not allowed to rewrite the underlying football projection. The model produces its football view first, then compares that independent view with de-vigged market probabilities, current prices and draft-market cost downstream.

That separation matters because the system can genuinely disagree with the market instead of simply echoing it.

The model is built to look for situations where its football information, role modeling, uncertainty estimates, historical context or price interpretation may identify something the broader market is underweighting. The goal is not to claim that every game or every player can be predicted better than Vegas or consensus. The goal is to identify specific situations where the disagreement is meaningful, explainable and strong enough to survive calibration and QA.

## True Value formula

The season-long True Value score is intentionally multi-factor rather than a single projection rank:

- Expected Fantasy Production — **35%**
- League-Winning Ceiling — **20%**
- Role / Volume — **15%**
- Offensive Environment — **10%**
- Availability — **10%**
- Weekly Reliability — **5%**
- Sustainability — **5%**

Conceptually:

`True Value = 0.35(Production) + 0.20(Ceiling) + 0.15(Role/Volume) + 0.10(Environment) + 0.10(Availability) + 0.05(Reliability) + 0.05(Sustainability)`

The formula is important because it prevents one attractive trait from dominating the evaluation. A high raw projection does not automatically make a player a top True Value if the role is fragile, availability is poor, the production is unsustainable or the realistic ceiling does not justify the ranking. Likewise, a player with strong role security, ceiling and sustainability can be identified before the market fully reflects that profile.

The formula is not the entire model. It is the season-long player-evaluation layer sitting on top of the broader projection, role, context, uncertainty and calibration architecture.

## Distribution-first rather than point-estimate-only

The system does not stop at a single projected fantasy score, player stat or game margin. It models distributions so downstream decisions can use probabilities, push probability, tail risk, volatility, conditional win probability and expected value rather than treating the mean projection as certainty.

This allows the model to distinguish between two players or games with similar averages but very different risk and ceiling profiles.

## Role and context matter before box-score results

The model attempts to identify changes in the underlying causes of production: target earning, routes or pass-play participation, rushing share, high-value touches, red-zone work, third-down role, first-team usage, depth-chart opportunity, QB context, offensive environment and injury/availability.

That creates the possibility of recognizing a breakout or deterioration before it becomes obvious in fantasy points or consensus rankings.

## Historical situational context

Situational indicators such as travel, rest, previous-game workload, overtime, large comeback stress, time-zone changes, consecutive road games and related schedule sequences may be tested as supporting inputs.

They are not accepted as predictive merely because a historical trend looks interesting. A situational effect must meet sample-size, replication, shrinkage and out-of-sample standards before receiving model weight. Weak trends may be shown as explanatory context but receive zero projection weight.

## Better Player versus Better Price

The model separates two different questions:

1. **Who is the better football/fantasy asset?**
2. **Who is the better selection at the current price?**

The Better Player decision is football-only. Draft price, ADP and sportsbook data are excluded from that decision. Price/value is evaluated afterward as a separate layer.

A player can therefore be the better player while the other player is the better draft value.

## How superiority will be judged

The platform should not claim that Chuck The Duke is better than Vegas, FantasyPros or another projection system simply because its architecture is more detailed.

That claim has to be earned through live and out-of-sample results such as:

- projection MAE / RMSE versus comparison systems
- probability calibration
- closing-line value
- ATS and prop performance after vig
- performance by confidence bucket
- ranking accuracy
- breakout / avoid identification
- stability of edges across future samples

The intended edge is selective rather than universal: identify the situations where the model has a credible, independently derived disagreement and only promote the signal when the evidence is strong enough.
