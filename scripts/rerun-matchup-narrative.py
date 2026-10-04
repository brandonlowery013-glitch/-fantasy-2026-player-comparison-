"""Readable explanations from the exact saved selection and pre-target-week facts."""
import math

def numeric(v): return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
def f(v): return f'{v:.1f}' if numeric(v) else 'not reported'
def canon(t): return {'WAS':'WSH','LA':'LAR','JAC':'JAX'}.get(t,t)

def matchup_sections(g,context):
    valid=any(canon(m['home_team'])==canon(g['home_team']) and canon(m['away_team'])==canon(g['away_team']) and m['event_start']==g['kickoff'] for m in context.get('matchups',[]))
    if not valid: return []
    result=[]
    for team,opp in [(g['away_team'],g['home_team']),(g['home_team'],g['away_team'])]:
        own=context['teams'].get(canon(team));other=context['teams'].get(canon(opp))
        if not own or not other: continue
        o,d=own['offense'],other['defense']; sentences=[]
        if all(numeric(x) for x in [o['passing_yards_per_attempt'],d['passing_yards_per_attempt'],o['pass_attempts_per_game']]):
            gap=d['passing_yards_per_attempt']-o['passing_yards_per_attempt']
            sentences.append(f"{team} has averaged {f(o['pass_attempts_per_game'])} pass attempts and {f(o['passing_yards_per_attempt'])} yards per attempt. {opp} has allowed {f(d['passing_yards_per_attempt'])} yards per attempt. " + ("That leaves an opening for the passing game to improve on its recent average." if gap>0 else "This defense has held opponents below that average, making the passing matchup more demanding." if gap<0 else "Those averages are level, so neither one establishes a clear passing advantage."))
        if all(numeric(x) for x in [o['sack_rate'],d['sack_rate']]):
            sentences.append(f"Protection matters here: {team} has taken a sack on {o['sack_rate']*100:.1f}% of dropbacks; {opp} has sacked opponents on {d['sack_rate']*100:.1f}%.")
        if all(numeric(x) for x in [o['carries_per_game'],o['rushing_yards_per_carry'],d['rushing_yards_per_carry']]):
            sentences.append(f"On the ground, {team} has averaged {f(o['carries_per_game'])} carries at {f(o['rushing_yards_per_carry'])} yards each, against a defense allowing {f(d['rushing_yards_per_carry'])}. " + ("The run matchup offers a way to stay out of long passing downs." if d['rushing_yards_per_carry']>o['rushing_yards_per_carry'] else "The run game faces a defense that has conceded less per carry than this offense usually gains." if d['rushing_yards_per_carry']<o['rushing_yards_per_carry'] else "The rushing averages are evenly matched."))
        proe=own.get('play_context',{}).get('proe_percentage_points')
        if numeric(proe):sentences.append(f"{team} passed {abs(proe):.1f} percentage points {'more' if proe>=0 else 'less'} often than expected for the situations it faced.")
        roster=[p for p in context.get('players',{}).values() if p['team']==canon(team)]
        leaders=[]
        for field,label in [('observed_attempts_per_game','pass attempts'),('observed_carries_per_game','carries'),('observed_targets_per_game','targets')]:
            candidates=[p for p in roster if numeric(p.get(field)) and p[field]>0]
            if candidates:
                p=max(candidates,key=lambda p:p[field]*p['games'])
                leaders.append(f"{p['name']} averaged {p[field]:.1f} {label} across {p['games']} games")
        if leaders:sentences.append('Through Week 3, '+ '; '.join(leaders)+'. These describe prior usage, not confirmation that each player will play in this matchup.')
        if sentences: result.append((f'{team} offense against {opp}', ' '.join(sentences)))
    return result

def pick_narrative(g,snapshot,kind):
    p=g['football_projection']; q=g['current_recommendations'][kind]; market=snapshot['market']; details=snapshot['markets'][kind]
    selection=q.get('selection'); decision=q.get('decision'); home,away=g['home_team'],g['away_team']; hm,am=p['home_score_mean'],p['away_score_mean']; total=hm+am
    paragraphs=[('What the score means',f"The model projects {away} {am:.1f}, {home} {hm:.1f}. " + (f"That puts {home if hm>am else away} ahead by {abs(hm-am):.1f} points." if hm!=am else 'That is an even game.'))]
    if not selection:
        paragraphs.append(('The decision', 'This pick is on hold because of the personnel check.' if decision=='WAIT' else 'Neither side offers enough value at the saved odds to qualify as a bet. A projected winner alone is not enough; the price also has to make sense.'))
        return paragraphs
    side_a=selection.startswith(home+' ') or (kind=='moneyline' and selection==home) or (kind=='total' and selection.upper().startswith('OVER'))
    side=details['side_a' if side_a else 'side_b'];odds=side['offered_odds'];payout=odds/100 if odds>0 else 100/abs(odds);breakeven=1/(1+payout)
    if kind=='spread':
        line=market['home_spread'] if side_a else -market['home_spread'];selected=home if side_a else away;margin=(hm-am)*(1 if side_a else -1);edge=margin+line
        paragraphs.append(('Why the spread has value',f"{selected} {'receives' if line>=0 else 'gives'} {abs(line):g} points. Adding that spread to the projected margin leaves {edge:.2f} points on {selected}'s side of the line ({margin:.2f} {line:+g} ≈ {edge:.2f}). This is why the model prefers {selection}. The point gap is not itself the chance of covering; the model also allows for how far actual scores can vary."))
    elif kind=='total':
        line=market['total'];over=selection.upper().startswith('OVER');gap=total-line
        paragraphs.append(('Why the total has value',f"The projected scores add up to {total:.2f}. The sportsbook line is {line:g}, leaving the forecast {abs(gap):.2f} points {'above' if gap>=0 else 'below'} it ({am:.2f} + {hm:.2f} − {line:g} ≈ {gap:+.2f}). That is the numerical case for {selection}. {'That requires enough drives to finish in points.' if over else 'The risk is that efficient drives or short fields push scoring above that line.'}"))
    else: paragraphs.append(('Why the price matters',f"The model favors {selection} to win outright, but the recommendation depends on whether its win probability is high enough for the offered odds."))
    win,push,loss=side['win_probability'],side['push_probability'],side['loss_probability'];conditional=side['conditional_win_probability'];ev=side['expected_value']
    paragraphs.append(('Working out the price',f"At {odds:+g}, a $10 winning stake earns ${10*payout:.2f} profit. You need to win {breakeven*100:.1f}% of bets that do not push to break even; the model estimates {conditional*100:.1f}%. Including pushes, it estimates {win*100:.1f}% wins, {push*100:.1f}% refunds and {loss*100:.1f}% losses. The estimated average profit per $10 is ${ev*10:.2f}: ({win:.4f} × ${payout*10:.2f}) − ({loss:.4f} × $10)."))
    if numeric(market.get('total')) and numeric(market.get('home_spread')):
        ht=(market['total']-market['home_spread'])/2;at=(market['total']+market['home_spread'])/2
        paragraphs.append(('What the sportsbook expects',f"The spread and total imply {away} {at:.2f} and {home} {ht:.2f} points. Those are market expectations used to compare with the forecast; they do not add extra points to the model."))
    paragraphs.append(('Final model decision',f"{selection} · {conditional*100:.1f}% chance of winning when the bet does not push · {str(q.get('confidence') or 'unrated').lower()} model confidence. The matchup observations below help explain the football risks. They have not changed this probability: the tested extra scoring adjustments did not show a reliable improvement."))
    return paragraphs
