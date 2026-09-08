const lower=x=>String(x||'').toLowerCase();
const esc=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export const mentionsPlayer=(text,name)=>{
  const n=lower(name).trim();
  return !!n&&new RegExp(`(^|[^a-z])${esc(n)}([^a-z]|$)`,'i').test(String(text||''));
};

export const structuredSubjectMatches=(signal,name)=>
  [signal?.player,signal?.player_name,signal?.subject,signal?.athlete]
    .some(x=>x&&lower(x).trim()===lower(name).trim());

export const signalFields=s=>[s?.headline,s?.description,s?.body_text,s?.matched_context].filter(Boolean);

export function splitEventFragments(text){
  const first=String(text||'')
    .split(/(?<=[.!?;|])\s+|\n+|\s+[—–]\s+/)
    .map(x=>x.trim()).filter(Boolean);
  const out=[];
  // Split chained roster/availability actions only at an explicit conjunction.
  // Do not split a subject from its own predicate (for example
  // "Tua Tagovailoa ruled out"), because that destroys connected-player
  // event binding. Also do NOT split on "named": "what Tua being named
  // starter means for Bijan" must stay intact so it is connected context,
  // not a direct Bijan starter claim.
  const actionBoundary=/\s+(?:,\s*)?(?:and\s+|then\s+)(?=(?:signed|re-signed|extended|placed|waived|released|activated|traded|claimed|designated|elevated|promoted|ruled|suspended|benched)\b)/ig;
  for(const piece of first){
    for(const sub of piece.split(actionBoundary).map(x=>x.trim()).filter(Boolean))out.push(sub);
  }
  return out;
}

function contextualObjectOnly(fragment,name){
  const f=lower(fragment),n=esc(lower(name).trim());
  const patterns=[
    new RegExp(`what\\s+.+?\\b(?:starter|starting|injur|return|trade|bench|suspend).+?\\bmeans\\s+for\\s+${n}(?:\\b|$)`,'i'),
    new RegExp(`what\\s+(?:it|this|that)\\s+means\\s+for\\s+${n}(?:\\b|$)`,'i'),
    new RegExp(`(?:impact|effect|implication)s?\\s+(?:of|from).+?\\b(?:on|for)\\s+${n}(?:\\b|$)`,'i'),
    new RegExp(`how\\s+.+?\\b(?:starter|starting|injur|return|trade|bench|suspend).+?\\b(?:affects?|impacts?)\\s+${n}(?:\\b|$)`,'i')
  ];
  return patterns.some(re=>re.test(f));
}

function otherNamedPlayers(fragment,target,canonical=[]){
  return (canonical||[]).filter(p=>p?.n&&p.n!==target&&mentionsPlayer(fragment,p.n));
}

export function directPlayerFragments(player,signal,canonical=[]){
  const fields=signalFields(signal);
  const named=[];
  for(const field of fields){
    for(const fragment of splitEventFragments(field)){
      if(!mentionsPlayer(fragment,player.n))continue;
      if(contextualObjectOnly(fragment,player.n))continue;
      const others=otherNamedPlayers(fragment,player.n,canonical);
      if(others.length&&!structuredSubjectMatches(signal,player.n))continue;
      named.push(fragment);
    }
  }
  if(named.length)return [...new Set(named)];
  if(structuredSubjectMatches(signal,player.n))return [...new Set(fields.map(String))];
  if(signal?.source==='ESPN_PLAYER'&&!fields.some(f=>otherNamedPlayers(f,player.n,canonical).length))return [...new Set(fields.map(String))];
  return [];
}

export function directPlayerEvidence(player,review,canonical=[]){
  const pieces=[];
  for(const signal of review?.material_news_signals||[])pieces.push(...directPlayerFragments(player,signal,canonical));
  if(review?.reason&&mentionsPlayer(review.reason,player.n)&&!contextualObjectOnly(review.reason,player.n))pieces.push(review.reason);
  return lower([...new Set(pieces)].join(' '));
}

export function sourcePlayerFragments(sourcePlayer,signal,canonical=[]){
  const fields=signalFields(signal),pieces=[];
  for(const field of fields){
    for(const fragment of splitEventFragments(field)){
      if(!mentionsPlayer(fragment,sourcePlayer.n))continue;
      const others=otherNamedPlayers(fragment,sourcePlayer.n,canonical);
      if(others.length){
        const sourceNameIndex=lower(fragment).indexOf(lower(sourcePlayer.n));
        const relationCut=lower(fragment).search(/\b(?:means for|affects?|impacts?|impact on|effect on|implications? for)\b/);
        if(relationCut>sourceNameIndex)pieces.push(fragment.slice(0,relationCut).trim());
        else if(structuredSubjectMatches(signal,sourcePlayer.n))pieces.push(fragment);
        continue;
      }
      pieces.push(fragment);
    }
  }
  if(!pieces.length&&structuredSubjectMatches(signal,sourcePlayer.n))pieces.push(...fields);
  return [...new Set(pieces.filter(Boolean))];
}
