// Additive evidence only: this module does not select or alter a forecast.
export function scoringContributions(artifact, evidence, expected) {
  function explain(model, values, names) {
    if (!Array.isArray(values) || values.length !== names.length ||
        ['mu','sd','beta'].some(k => !Array.isArray(model?.[k]) || model[k].length !== names.length))
      throw new Error('Scoring evidence dimensions mismatch');
    if (!Number.isFinite(model.a)) throw new Error('Invalid scoring intercept');
    const terms = names.map((name, i) => {
      const raw = values[i], mean = model.mu[i], scale = model.sd[i], coefficient = model.beta[i];
      if (![raw,mean,scale,coefficient].every(Number.isFinite) || scale <= 0)
        throw new Error('Invalid scoring evidence value');
      return {name, raw, training_mean:mean, training_scale:scale, coefficient,
        contribution:(raw-mean)/scale*coefficient};
    });
    const reconstructed = model.a + terms.reduce((sum, t) => sum+t.contribution, 0);
    if (!Number.isFinite(reconstructed)) throw new Error('Invalid reconstructed score');
    return {intercept:model.a, terms, reconstructed};
  }
  if (!artifact?.model_version || expected?.model_version !== artifact.model_version)
    throw new Error('Scoring evidence model version mismatch');
  const margin = explain(artifact.margin, evidence.margin_features,
    ['scoring_matchup_including_venue','rest_difference']);
  const total = explain(artifact.total, evidence.total_features,
    ['combined_scoring_matchup','absolute_rest_difference']);
  if(artifact.rest_adjustment_enabled===false){margin.terms=margin.terms.filter(t=>t.name!=='rest_difference');total.terms=total.terms.filter(t=>t.name!=='absolute_rest_difference');}
  const home = (total.reconstructed+margin.reconstructed)/2;
  const away = (total.reconstructed-margin.reconstructed)/2;
  // Expected means must be unrounded scorer output, not presentation values.
  if (![expected.home_score_mean,expected.away_score_mean].every(Number.isFinite) ||
      Math.abs(home-expected.home_score_mean)>1e-9 || Math.abs(away-expected.away_score_mean)>1e-9)
    throw new Error('Scoring evidence does not reconstruct forecast');
  const venue = evidence.home_field_advantage_feature*artifact.margin.beta[0]/artifact.margin.sd[0];
  if (!Number.isFinite(venue) || !Number.isFinite(evidence.home_field_advantage_contribution) ||
      Math.abs(venue-evidence.home_field_advantage_contribution)>1e-9)
    throw new Error('Scoring evidence venue mismatch');
  return {schema_version:1, model_version:artifact.model_version, margin, total,
    venue_component:{parent_term:'scoring_matchup_including_venue', contribution:venue,
      additive:false},
    scope:artifact.rest_adjustment_enabled===false?'Numerical attribution of scoring model with rest removed; not a causal explanation':'Numerical attribution of scoring/rest model; not a causal explanation',
    excluded_numeric_features:[...(artifact.excluded_numeric_features||[])]};
}
