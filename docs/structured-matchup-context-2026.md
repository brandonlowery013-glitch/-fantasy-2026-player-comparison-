# Current matchup observations and tested modifiers

The Week 4 context file contains Weeks 1–3 only: all 32 teams, 454 offensive players, and observed offensive snap shares for 429 unambiguously matched players. Team data includes pass/run volume, passing and rushing efficiency, sack rates, positional production allowed, and standard/PPR fantasy points allowed. Play-by-play adds pass rate over expected and neutral-situation pass share. QB-hit rate is explicitly not total pressure rate.

These observations support written matchup explanations. They do not invent projected opportunities, route shares, pressure rates, coverage grades or injury point values. Player averages remain separate from forecasts. Matchup explanations require exact opponents and kickoff; player comparisons require a unique name/team match and the correct week. The original model predictions and issued history are unchanged.

Eight individual scoring modifiers were evaluated against the no-rest scoring baseline on 544 held-out 2024–2025 games. All training and parameter selection used earlier seasons. Each modifier was capped at two points. None passed both the existing accuracy gate and the descriptive multiple-comparison-adjusted bootstrap bound. This is research evidence against promotion in this experiment, not proof that those football factors never matter. No new numeric coefficient was promoted.

Reproduction, using separately downloaded public nflverse files in `.cache/matchup-context/`:

- `node scripts/build-structured-matchup-context.mjs`
- `python3 scripts/enrich-structured-play-context.py`
- `node scripts/backtest-single-matchup-modifiers.mjs`
- `python3 scripts/render-all-game-rerun.py OUTPUT_HTML`

Source URLs and SHA-256 hashes accompany the context; historical input hashes accompany the modifier report. The renderer also produces `matchup-writeups.json` for the game interface. It uses the exact saved snapshot for odds, probabilities and expected return. Retrospective pages remain labeled as reruns, never as predictions published before kickoff.

Validation:

- `node scripts/test-structured-matchup-context.mjs`
- `python3 scripts/test-rerun-matchup-narrative.py`

Remaining work: connect these player observations to prop/fantasy presentation and validate any proposed opportunity or injury model separately. True pressure rate, route participation, coverage grades and neutral-situation pace are not supplied by this implementation. The new files are a bounded snapshot; they are not a newly scheduled collector.
