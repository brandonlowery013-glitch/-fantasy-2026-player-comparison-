import {pred} from './game-scoring-calibration.mjs';
import {scoringContributions} from './scoring-contributions.mjs';
export const NO_REST_VERSION='scoring-decay-no-rest-2026-v2';
export function applyRestPolicy(artifact,policy){
 if(policy?.rest_adjustment_enabled!==false)return artifact;
 if(artifact.model_version!=='scoring-decay-rest-2026-v1')throw Error('Unsupported rest-policy base version');
 return {...artifact,model_version:NO_REST_VERSION,base_model_version:artifact.model_version,rest_adjustment_enabled:false,
  variant_status:'USER_REQUESTED_UNVALIDATED_ABLATION',distribution:{...artifact.distribution,calibration_status:'BASE_MODEL_RESIDUALS_NO_REST_VARIANT_NOT_REVALIDATED'},
  margin:{...artifact.margin,beta:artifact.margin.beta.map((v,i)=>i===1?0:v)},total:{...artifact.total,beta:artifact.total.beta.map((v,i)=>i===1?0:v)},
  excluded_numeric_features:[...(artifact.excluded_numeric_features||[]),'Days of rest removed by explicit user instruction']};
}
export function removeRestFromForecast(artifact,forecast){
 if(forecast.model_version!==artifact.model_version)throw Error('Forecast rest-policy base version mismatch');
 // Verify the old evidence first; never infer contributions from rounded display values.
 scoringContributions(artifact,forecast.evidence,forecast);
 const model=applyRestPolicy(artifact,{rest_adjustment_enabled:false});
 const evidence={...forecast.evidence,method:'Historically calibrated scoring matchup; rest removed by user instruction',rest_days:null,rest_adjustment_applied:false,
  margin_features:[forecast.evidence.margin_features[0],model.margin.mu[1]],total_features:[forecast.evidence.total_features[0],model.total.mu[1]],excluded_numeric_features:model.excluded_numeric_features};
 const margin=pred(model.margin,[evidence.margin_features])[0],total=pred(model.total,[evidence.total_features])[0];
 const result={...forecast,home_score_mean:(total+margin)/2,away_score_mean:(total-margin)/2,model_version:model.model_version,
  variant_status:model.variant_status,base_model_version:artifact.model_version,
  distribution:{...forecast.distribution,calibration_status:'BASE_MODEL_RESIDUALS_NO_REST_VARIANT_NOT_REVALIDATED'},evidence};
 evidence.contributions=scoringContributions(model,evidence,result);return result;
}
