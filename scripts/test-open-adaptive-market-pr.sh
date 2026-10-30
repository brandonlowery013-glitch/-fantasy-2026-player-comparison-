#!/usr/bin/env bash
set -euo pipefail
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
cat > "$test_dir/gh" <<'MOCK'
#!/usr/bin/env bash
if [ "$1" = api ]; then
  if [ -f "$MOCK_STATE" ]; then echo 123; fi
elif [ "$1" = pr ] && [ "$2" = create ]; then
  touch "$MOCK_STATE"
  echo 'pull request create failed: HTTP 502: Bad Gateway' >&2
  exit 1
else exit 90
fi
MOCK
chmod +x "$test_dir/gh"
actual=$(PATH="$test_dir:$PATH" MOCK_STATE="$test_dir/created" GITHUB_REPOSITORY=owner/repo GITHUB_RETRY_DELAY_SECONDS=0 bash scripts/open-adaptive-market-pr.sh production/test)
[ "$actual" = 123 ]
echo 'PASS: a created PR is recovered after a transient creation-response failure.'
