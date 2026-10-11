const norm=s=>String(s||'').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
export function verifyNoHistoryRookie(player,roster,source,at){
 if(roster?.season?.year!==2026||roster?.season?.type!==2||roster.team?.displayName!==player.t||!/^https:\/\/site\.api\.espn\.com\/.*\/teams\/\d+\/roster$/.test(source)||!Number.isFinite(Date.parse(at)))return null;
 const matches=(roster.athletes||[]).flatMap(g=>g.items||[]).filter(a=>norm(a.displayName||a.fullName)===norm(player.n)&&a.position?.abbreviation===player.p);
 if(matches.length!==1||matches[0].experience?.years!==0||!matches[0].id)return null;
 return {name:player.n,position:player.p,team:player.t,athlete_id:String(matches[0].id),experience_years:0,season:2026,source,captured_at:at,reason:'Verified first NFL season in 2026; no 2021–2025 NFL games are manufactured.'};
}
