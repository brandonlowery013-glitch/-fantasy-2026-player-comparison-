// The season response can be capped midweek. Use it only to select a week.
export async function completeWeekSchedule({discover,fetchWeek,chooseWeek,forcedWeek=null}) {
  const week=forcedWeek==null?chooseWeek(await discover()):Number(forcedWeek);
  if(!Number.isInteger(week)||week<1||week>18)throw new Error('Unable to resolve regular-season week');
  const games=(await fetchWeek(week)).filter(g=>Number(g.week)===week);
  if(!games.length)throw new Error(`No verified games returned for week ${week}`);
  const teams=new Set(),ids=new Set();
  for(const g of games){
    const id=`${g.away_team}-${g.home_team}`;
    if(ids.has(id)||teams.has(g.away_team)||teams.has(g.home_team)||g.away_team===g.home_team)throw new Error(`Duplicate matchup/team in week ${week}`);
    ids.add(id);teams.add(g.away_team);teams.add(g.home_team);
  }
  return games;
}
