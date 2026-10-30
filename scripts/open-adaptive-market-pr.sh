#!/usr/bin/env bash
# Recover a PR created successfully when GitHub returns a transient error afterward.
set -euo pipefail
branch=${1:?branch required}
repo=${GITHUB_REPOSITORY:?repository required}
source scripts/github-api-retry.sh
error_file=$(mktemp)
trap 'rm -f "$error_file"' EXIT
for attempt in 1 2 3 4; do
  number=$(github_api_retry "repos/$repo/pulls?state=open&head=${repo%%/*}:$branch" --jq '.[0].number // empty')
  if [ -n "$number" ]; then printf '%s\n' "$number"; exit 0; fi
  if url=$(gh pr create --base main --head "$branch" --title "Production: adaptive pregame market refresh" --body "Automated adaptive market refresh. Required Guardrail QA must pass on the current protected candidate before merge." 2>"$error_file"); then
    printf '%s\n' "${url##*/}"; exit 0
  fi
  cat "$error_file" >&2
  if ! grep -Eqi 'HTTP (429|500|502|503|504)|connection reset|TLS handshake timeout|i/o timeout|already exists' "$error_file"; then exit 1; fi
  if [ "$attempt" -lt 4 ]; then sleep "${GITHUB_RETRY_DELAY_SECONDS:-2}"; fi
done
# The last POST may have succeeded even if its response failed.
number=$(github_api_retry "repos/$repo/pulls?state=open&head=${repo%%/*}:$branch" --jq '.[0].number // empty')
[ -n "$number" ] || exit 1
printf '%s\n' "$number"
