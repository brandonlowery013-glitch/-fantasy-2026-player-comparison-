#!/usr/bin/env bash
set -euo pipefail
: "${GITHUB_WORKSPACE:?GitHub workspace required}"
cd "$GITHUB_WORKSPACE"
git -C producer fetch --depth=1 --filter=blob:none origin main
git -C producer reset --hard FETCH_HEAD
git -C engine fetch --depth=1 --filter=blob:none origin frontend/ctd-cloudflare-work
git -C engine reset --hard FETCH_HEAD
cp producer/scripts/publish-prepared-game-model.mjs engine/publish-model.mjs
export CTD_ENGINE_REF
CTD_ENGINE_REF=$(git -C engine rev-parse HEAD)
node engine/publish-model.mjs "$GITHUB_WORKSPACE/prepared.json"
cd publication
git config user.name 'CTD Model Publisher'
git config user.email 'ctd-model-publisher@users.noreply.github.com'
for attempt in 1 2 3; do
 git fetch --depth=1 --filter=blob:none origin data/prepared-game-model
 git reset --hard origin/data/prepared-game-model
 mkdir -p data/market
 cp "$GITHUB_WORKSPACE/prepared.json.gz" data/market/prepared-game-model-2026.json.gz
 cp "$GITHUB_WORKSPACE/prepared.json.manifest.json" data/market/prepared-game-model-2026.manifest.json
 cp "$GITHUB_WORKSPACE/prepared.json.moneyline.json" data/market/prepared-game-model-2026.moneyline.json
 for kind in model betting model-envelope betting-envelope; do
  cp "$GITHUB_WORKSPACE/prepared.json.$kind.json.gz" "data/market/prepared-game-model-2026.$kind.json.gz"
 done
 git add data/market/prepared-game-model-2026*
 if git diff --cached --quiet; then exit 0; fi
 git commit -m 'Publish prepared game model [skip ci]'
 if git push origin HEAD:data/prepared-game-model; then exit 0; fi
done
echo 'Publication could not be committed without overwriting another writer.' >&2
exit 1
