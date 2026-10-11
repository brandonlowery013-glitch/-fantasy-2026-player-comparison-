#!/usr/bin/env bash
# Retry transient GitHub failures only; never fabricate a status or bypass checks.
github_api_retry() (
  local attempt=1 max_attempts=4 rc delay
  local stdout_file stderr_file
  stdout_file=$(mktemp)
  stderr_file=$(mktemp)
  trap 'rm -f "$stdout_file" "$stderr_file"' EXIT
  while true; do
    if gh api "$@" >"$stdout_file" 2>"$stderr_file"; then
      cat "$stdout_file"
      cat "$stderr_file" >&2
      return 0
    else
      rc=$?
    fi
    cat "$stderr_file" >&2
    if [ "$attempt" -ge "$max_attempts" ] || ! grep -Eqi 'HTTP (429|500|502|503|504)|connection reset|TLS handshake timeout|i/o timeout' "$stderr_file"; then
      return "$rc"
    fi
    delay=${GITHUB_RETRY_DELAY_SECONDS:-$((2 ** attempt))}
    echo "Transient GitHub API failure; retrying attempt $((attempt + 1))/${max_attempts}." >&2
    sleep "$delay"
    attempt=$((attempt + 1))
  done
)
