#!/usr/bin/env bash
set -euo pipefail
mode="${1:?impact publisher mode required}"
case "$mode" in
  connected) artifact='data/ingestion/connected-impact-queue-2026.json'; label='connected NFL impact queue' ;;
  bridge) artifact='data/ingestion/team-scoring-market-impact-bridge-2026.json'; label='team scoring market impact bridge' ;;
  interface) artifact='data/ingestion/interface-impact-payload-2026.json'; label='interface impact payload' ;;
  *) echo 'Unknown impact publisher mode'; exit 2 ;;
esac
: "${GH_TOKEN:?workflow token required}"
: "${GITHUB_REPOSITORY:?repository required}"
: "${GITHUB_RUN_ID:?run ID required}"
: "${GITHUB_RUN_ATTEMPT:?run attempt required}"
if ! git diff --cached --quiet; then
  echo 'Refusing to include unrelated staged changes in an impact publication'
  exit 1
fi
if git diff --quiet -- "$artifact"; then
  echo "No ${label} changes"
  exit 0
fi
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
branch="production/impact-${mode}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
git switch -c "$branch"
git add -- "$artifact"
git commit -m "Refresh ${label}"
git push origin "HEAD:$branch"
body_file=$(mktemp)
trap 'rm -f "$body_file"' EXIT
printf 'Publish the generated %s from workflow run %s. This contains the declared output only and must pass full Guardrail QA on the exact protected candidate before merge.\n' "$label" "$GITHUB_RUN_ID" > "$body_file"
pr_url=$(gh pr create --repo "$GITHUB_REPOSITORY" --base main --head "$branch" --title "Production: refresh ${label}" --body-file "$body_file")
pr_number="${pr_url##*/}"
[[ "$pr_number" =~ ^[0-9]+$ ]] || { echo 'Invalid production PR response'; exit 1; }
bash scripts/merge-guarded-production-pr.sh "$pr_number" "$branch" merge
