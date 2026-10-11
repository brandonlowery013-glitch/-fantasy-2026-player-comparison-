import {assessInjury} from './injury-evidence.mjs';
export function weeklyRankStatus(context,game,now=Date.now()){
  if(!game)return 'NO_CURRENT_WEEK_GAME';
  const report=context?.signals?.injury?.evidence;
  const assessed=report?assessInjury(report,now):null;
  // Retain an adverse designation as a hold until superseded. Expiry is not clearance.
  const unresolvedAbsence=assessed?.reported_designation&&/^(out|inactive|injured reserve|ir|physically unable to perform|pup|suspended)$/i.test(assessed.reported_designation);
  if(assessed?.expected_active===false||(!report&&context?.expected_active===false))return 'NOT_EXPECTED_TO_PLAY';
  if(unresolvedAbsence)return 'REPORTED_ABSENCE_REVIEW_REQUIRED';
  if(Date.parse(game.event_start)<=now)return 'GAME_STARTED_NO_ORIGINAL_WEEKLY_RANK';
  const expected=assessed?assessed.expected_active:context?.expected_active;
  return expected===true?'MODEL_RANK':'PROVISIONAL_AVAILABILITY_REVIEW';
}
