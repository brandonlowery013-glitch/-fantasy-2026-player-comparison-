#!/usr/bin/env bash
set -euo pipefail

PR_NUMBER="${1:?PR number required}"
BRANCH="${2:?production branch required}"
MERGE_METHOD="${3:-merge}"
MAX_POLLS="${MAX_POLLS:-180}"
SLEEP_SECONDS="${SLEEP_SECONDS:-10}"
REQUIRED_CHECK_APP_ID="${REQUIRED_CHECK_APP_ID:-15368}"

case "$MERGE_METHOD" in
  merge|squash|rebase) ;;
  *) echo "FAIL: unsupported merge method: $MERGE_METHOD"; exit 2 ;;
esac

: "${GH_TOKEN:?GH_TOKEN must be set}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY must be set}"

last_dispatched_merge_sha=''

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

status_for_sha() {
  local sha="$1"
  gh api "repos/${GITHUB_REPOSITORY}/commits/${sha}/status" \
    --jq '[.statuses[] | select(.context == "guardrail-qa")] | sort_by(.updated_at) | last | .state // "missing"'
}

check_for_sha() {
  local sha="$1"
  gh api -H 'Accept: application/vnd.github+json' \
    "repos/${GITHUB_REPOSITORY}/commits/${sha}/check-runs?check_name=guardrail-qa" \
    --jq "[.check_runs[] | select(.app.id == ${REQUIRED_CHECK_APP_ID})] | sort_by(.completed_at // .started_at) | last | .conclusion // \"missing\""
}

dispatch_guardrail() {
  local merge_sha="$1"
  echo "Dispatching Guardrail QA for current protected candidate ${merge_sha} from ${BRANCH}."
  gh workflow run guardrail-qa.yml --repo "$GITHUB_REPOSITORY" --ref "$BRANCH"
  last_dispatched_merge_sha="$merge_sha"
}

refresh_branch_to_current_main() {
  git fetch origin main "$BRANCH"
  git switch "$BRANCH"
  local head_sha main_sha
  head_sha=$(git rev-parse HEAD)
  main_sha=$(git rev-parse origin/main)
  if git merge-base --is-ancestor "$main_sha" "$head_sha"; then
    return 0
  fi

  echo "Protected main advanced to ${main_sha}; refreshing ${BRANCH} before Guardrail validation."
  if ! git merge --no-edit origin/main; then
    git merge --abort || true
    echo "FAIL: ${BRANCH} conflicts with current protected main; refusing to force or bypass protection."
    return 1
  fi
  local refreshed_sha
  refreshed_sha=$(git rev-parse HEAD)
  git push origin "HEAD:${BRANCH}"
  echo "Refreshed production branch ${BRANCH}: ${head_sha} -> ${refreshed_sha}."
  last_dispatched_merge_sha=''
}

for _ in $(seq 1 "$MAX_POLLS"); do
  refresh_branch_to_current_main

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
  HEAD_CHECK=$(check_for_sha "$HEAD_SHA")
  MERGE_CHECK=$(check_for_sha "$MERGE_SHA")

  if [ "$HEAD_STATUS" = 'success' ] && [ "$MERGE_STATUS" = 'success' ] && [ "$HEAD_CHECK" = 'success' ] && [ "$MERGE_CHECK" = 'success' ]; then
    CURRENT_JSON=$(gh api "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}")
    CURRENT_HEAD=$(printf '%s' "$CURRENT_JSON" | jq -r '.head.sha // empty')
    CURRENT_MERGE=$(printf '%s' "$CURRENT_JSON" | jq -r '.merge_commit_sha // empty')
    CURRENT_MAIN=$(gh api "repos/${GITHUB_REPOSITORY}/git/ref/heads/main" --jq '.object.sha')
    git fetch origin main >/dev/null 2>&1

    if [ "$CURRENT_HEAD" != "$HEAD_SHA" ] || [ "$CURRENT_MERGE" != "$MERGE_SHA" ]; then
      echo "Protected candidate moved before merge (${HEAD_SHA}/${MERGE_SHA} -> ${CURRENT_HEAD}/${CURRENT_MERGE}); revalidating the new exact candidate."
      last_dispatched_merge_sha=''
      sleep "$SLEEP_SECONDS"
      continue
    fi
    if ! git merge-base --is-ancestor "$CURRENT_MAIN" "$HEAD_SHA"; then
      echo "Protected main advanced again to ${CURRENT_MAIN}; refreshing branch and discarding stale validation."
      last_dispatched_merge_sha=''
      continue
    fi

    echo "Guardrail QA status and GitHub Actions check are green on exact up-to-date PR head ${HEAD_SHA} and protected synthetic merge ${MERGE_SHA}."
    if gh pr merge "$PR_NUMBER" \
      --repo "$GITHUB_REPOSITORY" \
      --match-head-commit "$HEAD_SHA" \
      "--${MERGE_METHOD}" \
      --delete-branch; then
      echo "Merged protected production PR #${PR_NUMBER} from exact validated candidate ${MERGE_SHA}."
      exit 0
    fi

    echo "Merge was rejected after validation; protected main likely moved. Refreshing instead of reusing stale validation."
    last_dispatched_merge_sha=''
    sleep "$SLEEP_SECONDS"
    continue
  fi

  if [ "$MERGE_SHA" != "$last_dispatched_merge_sha" ]; then
    dispatch_guardrail "$MERGE_SHA"
  else
    echo "Waiting for Guardrail QA on protected candidate ${MERGE_SHA} (head_status=${HEAD_STATUS}, merge_status=${MERGE_STATUS}, head_check=${HEAD_CHECK}, merge_check=${MERGE_CHECK})."
  fi
  sleep "$SLEEP_SECONDS"
done

echo "FAIL: PR #${PR_NUMBER} never reached a stable up-to-date exact-candidate Guardrail pass within the bounded retry window."
exit 1
