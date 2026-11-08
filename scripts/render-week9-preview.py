import json, html
from pathlib import Path

root=Path('frontend/cloudflare')
d=json.loads((root/'data/week9-variant-preview.json').read_text())
esc=lambda s:html.escape(str(s))
stories={
'DAL-IND':('Dallas brings the reputation. Indianapolis brings the points.','The scoring model has this almost level at 24.8–24.7. Dallas may have the louder fanbase, but volume is not a predictive feature. All three lean Indy +4.5; the two calibration variants refuse to turn that lean into a pick.'),
'NYJ-KC':('Nine and a half points: the Jets loyalty program.','All three approve New York +9.5. This is a cover forecast, not a declaration that the Jets have become trustworthy. You can lose the game and still leave the sportsbook looking employed.'),
'DET-MIA':('Miami gets a cushion, not a character reference.','All three point toward Miami +6.5, but only football scoring clears the pick threshold. The calibration models are standing behind the velvet rope with their arms folded.'),
'CLE-NO':('The committee has elected to do absolutely nothing.','At the captured New Orleans -3.5 line, all three lean Cleveland, and all three pass. Sometimes the strongest team on the field is the one wearing a PASS badge.'),
'NYG-PHI':('An NFC East disagreement: shocking development.','The variants lean Philadelphia +3, but only football scoring approves. The model nearly ties the actual game. The division has once again submitted a matchup best reviewed by a mediator.'),
'LA-WAS':('The Rams–Washington file stays on the desk.','All three lean Washington +4.5, but only football scoring approves. The calibration variants are willing to hear the argument; they are not ready to put their names on the group project.'),
'DEN-CAR':('Carolina is asking for a little respect and a few points.','The football score projection is nearly even. Read the three variant columns separately: a model direction is a lean, while PICK means its price also clears the existing thresholds.'),
'HOU-LAC':('The Chargers are receiving points and your emotional baggage.','All three lean Los Angeles +5.5. Only the football variant approves. The other two apparently have watched enough Chargers football to insist on paperwork.'),
'GB-NE':('The models have requested separate hotel rooms.','Football scoring likes New England -3. Both calibration variants lean Green Bay +3, with the learning variant approving it. This is a disagreement spot, not a consensus pick.'),
'LV-SF':('The Raiders: a large cushion with no warranty.','The two calibration variants lean Las Vegas +9.5; only learning approves. Football scoring barely leans San Francisco and passes. A 2–1 directional vote is not three models signing the same permission slip.'),
'ARI-SEA':('Seattle’s résumé meets Arizona’s head start.','Football scoring approves Seattle -8.5. Both calibration variants lean Arizona +8.5 but pass. A disagreement this clear belongs in the table, not hidden under a confidence sticker.'),
'TB-CHI':('Chicago weather, prime time, and a six-point argument.','All three lean Tampa Bay +6. Football scoring and calibration plus learning approve; plain calibration passes. Two picks and one cautious chaperone is enough for a watchlist, not a victory parade.'),
'BUF-MIN':('Minnesota gets three points and three signatures.','All three approve Minnesota +3. The scoring variant is much more optimistic than either calibration variant, so use the modest consensus—not the loudest probability—as the headline. Nobody gets an extra payout for shouting 64 percent.'),
'CIN-ATL':('The early game has already clocked in.','Kickoff passed before this comparison was generated. No new pregame selection is created here. The model may have opinions; it does not have a time machine.'),
'JAX-BAL':('Thursday has left the group chat.','This game is already final in the verified schedule. It remains in the complete slate for context, with no retrospective pregame pick invented.')}

order=[r['id'] for r in d['ranking']]
ranking=''.join(f"<tr><td>{r['rank']}</td><td>{esc(r['name'])}</td><td>{r['wins']}–{r['losses']}</td><td>{r['brier']:.4f}</td></tr>" for r in d['ranking'])
rows=[];articles=[]
for g in d['games']:
    key=g['away']+'-'+g['home'];title,body=stories[key]
    cells=[]
    for k in order:
        v=g['variants'].get(k)
        if not v:cells.append('<td>—</td>');continue
        odds=g['quote']['market']['home_spread_price'] if v['direction'].startswith(g['home']+' ') else g['quote']['market']['away_spread_price']
        cells.append(f"<td><b>{esc(v['direction'])}</b><small>{v['cover_probability']*100:.1f}% · {odds:+g}</small><span class=\"{v['decision'].lower()}\">{v['decision']}</span></td>")
    rows.append(f"<tr><th>{esc(g['away'])} @ {esc(g['home'])}<small>{esc(g['status'])}</small></th>{''.join(cells)}</tr>")
    articles.append(f"<article><div class=eyebrow>{esc(g['away'])} @ {esc(g['home'])}</div><h3>{esc(title)}</h3><p>{esc(body)}</p></article>")
heads=''.join('<th>'+esc(r['name'])+'</th>' for r in d['ranking'])
body=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CTD · Week 9 matchup preview</title><style>
*{{box-sizing:border-box}}body{{margin:0;background:#07131c;color:#e8edf2;font:16px/1.65 system-ui,sans-serif}}main{{max-width:1180px;margin:auto;padding:32px 22px 70px}}a{{color:#d5ed77}}header{{padding:38px;border:1px solid #365148;border-top:4px solid #d5ed77;border-radius:12px;background:linear-gradient(135deg,#172d2b,#0b1922)}}h1{{font-size:clamp(36px,6vw,64px);line-height:1.08;letter-spacing:-.04em}}h2{{margin-top:42px}}.eyebrow{{letter-spacing:.14em;color:#d5ed77;font-size:11px;font-weight:800}}.lede{{font-size:22px;color:#c3d5cc}}.note,small{{font-size:12px;color:#a9bdc8}}small{{display:block}}.notice{{border-left:3px solid #d5ed77;background:#13262e;padding:20px}}.scroll{{overflow-x:auto}}table{{width:100%;border-collapse:collapse;background:#0c1b26}}td,th{{padding:15px;border-bottom:1px solid #2b414e;text-align:left;vertical-align:top}}th{{color:#c4d8ac}}td b{{white-space:nowrap}}.pick,.pass{{display:inline-block;font-size:10px;letter-spacing:.1em;padding:3px 8px;margin-top:6px;border-radius:12px}}.pick{{color:#8de2b4;background:#15372d}}.pass{{color:#c3cbd0;background:#25313e}}.stories{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}article{{padding:24px;background:#0d1c26;border:1px solid #2d424f;border-radius:10px}}h3{{line-height:1.35;margin:12px 0}}article p{{color:#b6c9d1;font-size:14px}}footer{{margin-top:40px;border-top:1px solid #2d424f;padding-top:20px;font-size:12px;color:#9eb6c2}}@media(max-width:700px){{main{{padding:20px 12px}}header{{padding:24px}}.stories{{grid-template-columns:1fr}}td,th{{padding:11px;font-size:13px}}}}
</style></head><body><main><p><a href="index.html#week-8-recap">← Week 8 recap</a> · <a href="index.html">CTD live board</a></p><header><div class=eyebrow>THE DUKE DISPATCH · WEEK 9 · NOVEMBER 8, 2026</div><h1>Three models.<br>One very loud Sunday.</h1><p class=lede>The Jets get points. Minnesota gets consensus. Dallas–Indy stays in the meeting.</p><p>Full NFL slate · Three recovered spread variants · Humorous matchup commentary</p></header>
<h2>The picks with three signatures</h2><p><b>Jets +9.5</b> and <b>Vikings +3</b> clear the unchanged pick thresholds in all three variants at the captured prices. Carolina +2.5 and Tampa Bay +6 clear two variants. Every other game stays in the comparison—including Dallas at Indianapolis.</p>
<p class=notice>Research preview, not a new live model selection. The three variants were recovered and ranked for this report; the original user-selected top-three leaderboard was unavailable. Probabilities are model estimates, not established hit rates. The current football variant uses the requested no-rest ablation, so older football backtest results do not validate that modification.</p>
<h2>Same games. Same test window.</h2><p>Ranked by lower Brier score on the same <b>56 non-push games in Weeks 3–6</b>, with each calibration fit using earlier weeks only. Lower Brier means better probability accuracy. Directional win–loss is shown separately; it is not a filtered betting return. Weeks without a valid line-aware fit are excluded from every variant.</p><div class=scroll><table><thead><tr><th>Rank</th><th>Recovered variant</th><th>Direction W–L</th><th>Brier ↓</th></tr></thead><tbody>{ranking}</tbody></table></div>
<h2>Every spread matchup</h2><p class=note>ESPN-listed DraftKings quotes captured {esc(d['generated_at'])}. Lines can move. PICK clears CTD’s 3-percentage-point probability-edge, 2% EV and 52% conditional-probability thresholds. PASS can still show a directional lean. Integer-spread calibration probabilities and EV are conditional on no push. Current calibration fits use the recovered seed through Week 6, not a claimed completed Week 8 learning update.</p><div class=scroll><table><thead><tr><th>Game</th>{heads}</tr></thead><tbody>{''.join(rows)}</tbody></table></div>
<h2>The matchup roast</h2><div class=stories>{''.join(articles)}</div><footer>All 15 verified Week 9 matchups included. Started and completed games receive no new pregame pick. Humorous commentary is editorial; numerical results come from the accompanying saved comparison. No wagers are placed.</footer></main></body></html>'''
# Public dispatch is editorial only; variant testing remains in the research data.
import re
body=re.sub(r'<h2>The picks with three signatures</h2>.*?<h2>The matchup roast</h2>', '<p class="notice">Week 9 matchup humor. Spread-variant testing is kept separate from the live board; no three-model ensemble or live model switch is applied.</p><h2>The matchup roast</h2>', body, flags=re.S)
body=body.replace('Three models.<br>One very loud Sunday.', 'Week 9.<br>Everyone has a plan.')
body=body.replace('The Jets get points. Minnesota gets consensus. Dallas–Indy stays in the meeting.', 'Fifteen matchups. Plenty of confidence. No shortage of material.')
body=body.replace('Full NFL slate · Three recovered spread variants · Humorous matchup commentary', 'Full NFL slate · Humorous matchup commentary')
editorial={
'DAL-IND': 'Dallas brings the national spotlight; Indianapolis brings a fanbase asking whether the spotlight can also locate a defense. Brandon has already denied the Colts a character reference. The game remains on the schedule anyway.',
'NYJ-KC': 'The Jets travel to Kansas City hoping the underdog role comes with complimentary snacks. Winning and covering are different assignments; New York would appreciate partial credit.',
'DET-MIA': 'Detroit arrives with ambition. Miami arrives with humidity and the hope that the visitors packed the wrong shoes. Someone is leaving this game with an explanation that begins with “if you take away those two plays.”',
'CLE-NO': 'Cleveland and New Orleans meet in a game whose postgame press conference may contain more promises than the action. Somebody has to win, unless both offenses negotiate an extension.',
'NYG-PHI': 'An NFC East game: four quarters of football followed by six days of people arguing like the result settled a property dispute. The winner gets bragging rights; the loser gets a very loud local radio segment.',
'LA-WAS': 'Los Angeles visits Washington for a game that will have one fanbase declaring the season back on and the other pricing coordinator replacements. Both reactions can happen before halftime.',
'DEN-CAR': 'Denver and Carolina meet with every fan convinced this is the game their team should handle. That sentence is responsible for approximately half of Sunday’s emotional damage.',
'HOU-LAC': 'Houston and the Chargers have been assigned a football game. Chargers fans have also been assigned a breathing exercise and a reminder not to celebrate before the clock reaches zero.',
'GB-NE': 'Green Bay and New England bring enough history to open a museum. Unfortunately for both teams, the scoreboard does not accept championships from previous decades as legal tender.',
'LV-SF': 'Las Vegas visits San Francisco, where optimism will be inspected at the door. The Raiders would like a competitive afternoon; their fans would settle for an afternoon that does not require an apology.',
'ARI-SEA': 'Arizona travels to Seattle for the traditional divisional reminder that familiarity does not produce friendship. One fanbase will call it a statement win; the other will announce that division games are always weird.',
'TB-CHI': 'Tampa Bay comes to Chicago for prime time, giving Bears fans a national audience for feelings they were going to have anyway. The weather, play-calling and offensive line are all available for blame.',
'BUF-MIN': 'Buffalo and Minnesota close the slate with two fanbases who understand that hope should come with a waiver. Somebody gets a satisfying Monday night. Somebody gets to stare at the ceiling.',
'CIN-ATL': 'The early game had already started when this dispatch was prepared. No new pregame pick is created after kickoff. The comedy department has a keyboard, not a time machine.',
'JAX-BAL': 'Thursday’s game is already final in the verified schedule. It stays in the full-week roll call, but any brand-new “pregame lock” for this one deserves a fraud investigation.'}
for key,(title,old) in stories.items(): body=body.replace(esc(old),esc(editorial[key]))
(root/'week-9-preview.html').write_text(body)
(root/'week-9-preview-nav.js').write_text("(()=>{const nav=document.getElementById('nav');if(!nav)return;const b=document.createElement('button');b.textContent='WEEK 9 PREVIEW';b.addEventListener('click',()=>{location.href='week-9-preview.html'});nav.append(b);})();\n")

