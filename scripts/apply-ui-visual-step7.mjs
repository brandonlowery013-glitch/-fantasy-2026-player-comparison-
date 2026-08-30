import fs from 'node:fs';

const STYLE='<link rel="stylesheet" href="ui-step7-chuck-duke.css?v=20260829-step7">';

function replaceRequired(text, from, to, label){
  if(text.includes(to)) return text;
  if(!text.includes(from)) throw new Error(`Step 7 integration marker missing: ${label}`);
  return text.replace(from,to);
}

function writeIfChanged(path, next){
  const before=fs.readFileSync(path,'utf8');
  if(before===next) return false;
  fs.writeFileSync(path,next);
  return true;
}

let index=fs.readFileSync('index.html','utf8');
if(!index.includes(STYLE)) index=index.replace('</head>',`${STYLE}\n</head>`);
index=replaceRequired(index,'Browse the model directly. Layout is intentionally temporary while the functional shell is validated.','Browse the full Chuck The Duke player model with football projection, player quality, draft value and market context kept visibly separate.','board copy');
index=replaceRequired(index,'Game projections, trap-game analysis, opportunities and market movement will live here. This shell currently proves the route and data state.','Verified NFL game context, model opportunities and market movement are presented here without changing the underlying football forecast.','games copy');
index=replaceRequired(index,'<header class="top">','<header class="top" data-step7-visual="chuck-the-duke">','visual marker');
writeIfChanged('index.html',index);

let opp=fs.readFileSync('weekly-opportunities.html','utf8');
if(!opp.includes(STYLE)) opp=opp.replace('</head>',`${STYLE}</head>`);
writeIfChanged('weekly-opportunities.html',opp);

let compare=fs.readFileSync('compare.html','utf8');
const legacyVisual="const VISUAL='<link rel=\"stylesheet\" href=\"ui-step7-chuck-duke.css?v=20260829-step7\">';";
compare=compare.replace(legacyVisual,'');
compare=compare.replace('h=h.replace(headMarker,VISUAL+RESPONSIVE+headMarker);','h=h.replace(headMarker,RESPONSIVE+headMarker);');
if(!compare.includes("h=h.replace(headMarker,STYLE+headMarker);")){
  compare=compare.replace("const RESPONSIVE=`<style id=\"step6-responsive-contract\">",`const STYLE='${STYLE}';const RESPONSIVE=\`<style id=\"step6-responsive-contract\">`);
  compare=compare.replace('h=h.replace(headMarker,RESPONSIVE+headMarker);','h=h.replace(headMarker,STYLE+headMarker);h=h.replace(headMarker,RESPONSIVE+headMarker);');
}
writeIfChanged('compare.html',compare);

console.log('Step 7 visual integration applied idempotently.');
