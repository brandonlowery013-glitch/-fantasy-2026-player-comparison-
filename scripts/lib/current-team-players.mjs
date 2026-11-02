import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {applyCurrentTeams} from '../../lib/current-player-teams.mjs';
export function currentTeamPlayers(players){
 const path='data/ingestion/current-player-teams-2026.json';let identity;
 try{identity=JSON.parse(fs.readFileSync(path,'utf8'));return applyCurrentTeams(players,identity);}catch{}
 execFileSync(process.execPath,['scripts/validate-canonical-team-identity.mjs'],{stdio:'inherit'});
 identity=JSON.parse(fs.readFileSync(path,'utf8'));return applyCurrentTeams(players,identity);
}
