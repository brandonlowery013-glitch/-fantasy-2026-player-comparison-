#!/usr/bin/env bash
set -euo pipefail

PR_NUMBER="${1:?PR number required}"
BRANCH="${2:?production branch required}"
MERGE_METHOD="${3:-merge}"
MAX_POLLS="${MAX_POLLS:-180}"
SLEEP_SECONDS="${SLEEP_SECONDS:-10}"

case "$MERGE_METHOD" in
  merge|squash|rebase) ;;
  *) echo "FAIL: unsupported merge method: $MERGE_METHOD"; exit 2 ;;
esac

: "${GH_TOKEN:?GH_TOKEN must be set}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY must be set}"

last_dispatched_merge_sha=''

status_for_sha() {
  local sha="$1"
  gh api "repos/${GITHUB_REPOSITORY}/commits/${sha}/status" \
    --jq '[.statuses[] | select(.context == "guardrail-qa")] | sort_by(.updated_at) | last | .state // "missing"'
}

dispatch_guardrail() {
  local merge_sha="$1"
  echo "Dispatching Guardrail QA for current protected candidate ${merge_sha} from ${BRANCH}."
  gh workflow run guardrail-qa.yml --repo "$GITHUB_REPOSITORY" --ref "$BRANCH"
  last_dispatched_merge_sha="$merge_sha"
}

for _ in $(seq 1 "$MAX_POLLS"); do
  PR_JSON=$(gh api "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}")
  PR_STATE=$(printf '%s' "$PR_JSON" | jq -r '.state')
  MERGED=$(printf '%s' "$PR_JSON" | jq -r '.merged')

  if [ "$MERGED" = 'true' ]; then
    echo "PR #${PR_NUMBER} already merged."
    exit 0
  fi
  if [ "$PR_STATE" != 'open' ]; then
    echo "FAIL: PR #${PR_NUMBER} is ${PR_STATE} and was not merged."
    exit 1
  fi

  HEAD_SHA=$(printf '%s' "$PR_JSON" | jq -r '.head.sha // empty')
  MERGE_SHA=$(printf '%s' "$PR_JSON" | jq -r '.merge_commit_sha // empty')
  HEAD_REF=$(printf '%s' "$PR_JSON" | jq -r '.head.ref // empty')

  if [ -z "$HEAD_SHA" ] || [ -z "$MERGE_SHA" ]; then
    echo "Protected candidate is still being prepared; waiting."
    sleep "$SLEEP_SECONDS"
    continue
  fi
  if [ "$HEAD_REF" != "$BRANCH" ]; then
    echo "FAIL: PR #${PR_NUMBER} head changed from expected ${BRANCH} to ${HEAD_REF}."
    exit 1
  fi

  HEAD_STATUS=$(status_for_sha "$HEAD_SHA")
  MERGE_STATUS=$(status_for_sha "$MERGE_SHA")

  if [ "$HEAD_STATUS" = 'success' ] && [ "$MERGE_STATUS" = 'success' ]; then
    CURRENT_JSON=$(gh api "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}")
    CURRENT_HEAD=$(printf '%s' "$CURRENT_JSON" | jq -r '.head.sha // empty')
    CURRENT_MERGE=$(printf '%s' "$CURRENT_JSON" | jq -r '.merge_commit_sha // empty')

    if [ "$CURRENT_HEAD" != "$HEAD_SHA" ] || [ "$CURRENT_MERGE" != "$MERGE_SHA" ]; then
      echo "Protected candidate moved before merge (${HEAD_SHA}/${MERGE_SHA} -> ${CURRENT_HEAD}/${CURRENT_MERGE}); revalidating the new exact candidate."
      last_dispatched_merge_sha=''
      sleep "$SLEEP_SECONDS"
      continue
    fi

    echo "Guardrail QA is green on exact PR head ${HEAD_SHA} and protected synthetic merge ${MERGE_SHA}."
    if gh pr merge "$PR_NUMBER" \
      --repo "$GITHUB_REPOSITORY" \
      --match-head-commit "$HEAD_SHA" \
      "--${MERGE_METHOD}" \
      --delete-branch; then
      echo "Merged protected production PR #${PR_NUMBER} from exact validated candidate ${MERGE_SHA}."
      exit 0
    fi

    echo "Merge was rejected after validation; protected main likely moved. Re-reading the PR instead of reusing stale validation."
    last_dispatched_merge_sha=''
    sleep "$SLEEP_SECONDS"
    continue
  fi

  if [ "$MERGE_SHA" != "$last_dispatched_merge_sha" ]; then
    dispatch_guardrail "$MERGE_SHA"
  else
    echo "Waiting for Guardrail QA on protected candidate ${MERGE_SHA} (head=${HEAD_STATUS}, merge=${MERGE_STATUS})."
  fi
  sleep "$SLEEP_SECONDS"
done

echo "FAIL: PR #${PR_NUMBER} never reached a stable exact-candidate Guardrail pass within the bounded retry window."
exit 1
