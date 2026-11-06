#!/usr/bin/env bash
# Publish a NOIR Android update that installed launchers pick up automatically.
#
#   scripts/release-android.sh "What changed in this version"
#
# Builds the version in android/noir.properties, signs it with the permanent NOIR key, and commits
# noir-launcher-<version>.apk + noir-update.json to the `updateBranch` of `updateRepo`. Launchers read
# https://raw.githubusercontent.com/<repo>/<branch>/noir-update.json at start-up and every 6 hours.
# Requires android/signing.properties + android/noir-signing.keystore (never committed).
set -euo pipefail
cd "$(dirname "$0")/.."
NOTES="${1:-Improvements and fixes.}"
PROPS=android/noir.properties
get() { grep -E "^$1=" "$PROPS" | head -1 | cut -d= -f2- | tr -d '[:space:]'; }
CODE=$(get versionCode); NAME=$(get versionName); REPO=$(get updateRepo); BRANCH=$(get updateBranch)
BRANCH=${BRANCH:-updates}

[ -f android/signing.properties ] || { echo "Missing android/signing.properties (the permanent NOIR signing key). Upload it first."; exit 1; }
[ -n "$REPO" ] || { echo "Set updateRepo=owner/repo in $PROPS first."; exit 1; }

./scripts/build-android.sh

WT=$(mktemp -d)
trap 'git worktree remove --force "$WT" >/dev/null 2>&1 || true' EXIT
if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  git fetch -q origin "$BRANCH"
  git worktree add -q -B "$BRANCH" "$WT" "origin/$BRANCH"
else
  git worktree add -q --detach "$WT"
  (cd "$WT" && git checkout -q --orphan "$BRANCH" && git rm -rq . && rm -rf ./*)
fi
[ -f "$WT/noir-launcher-$NAME.apk" ] && { echo "Version $NAME is already published — bump $PROPS."; exit 1; }

APK="noir-launcher-$NAME.apk"
cp android/app/build/outputs/apk/release/app-release.apk "$WT/$APK"
SHA=$(sha256sum "$WT/$APK" | cut -d' ' -f1)
node -e '
const [code, name, repo, branch, apk, sha, notes, out] = process.argv.slice(1);
const m = { versionCode: Number(code), versionName: name, sha256: sha, notes, publishedAt: new Date().toISOString(),
  apkUrl: `https://raw.githubusercontent.com/${repo}/${branch}/${apk}` };
require("fs").writeFileSync(out, JSON.stringify(m, null, 2) + "\n");
' "$CODE" "$NAME" "$REPO" "$BRANCH" "$APK" "$SHA" "$NOTES" "$WT/noir-update.json"
# Keep only the three newest APKs on the branch.
(cd "$WT" && ls -1t noir-launcher-*.apk | tail -n +4 | xargs -r git rm -q --ignore-unmatch -- 2>/dev/null; ls -1t noir-launcher-*.apk | tail -n +4 | xargs -r rm -f)
printf '# NOIR updates\n\nPublished builds of the NOIR Google TV launcher. Installed launchers read `noir-update.json`.\n\nLatest: **%s**\n' "$NAME" > "$WT/README.md"
(cd "$WT" && git add -A && git -c user.name="NOIR release" -c user.email="noreply@noir.local" commit -qm "NOIR $NAME" && git push -q origin "HEAD:$BRANCH")

NEXT_CODE=$((CODE + 1))
NEXT_NAME=$(echo "$NAME" | awk -F. '{ printf "%d.%d.%d", $1, $2, $3 + 1 }')
sed -i.bak -e "s/^versionCode=.*/versionCode=$NEXT_CODE/" -e "s/^versionName=.*/versionName=$NEXT_NAME/" "$PROPS" && rm -f "$PROPS.bak"
echo "Published NOIR $NAME. Launchers offer it within ~6 hours, or now via Settings → System → Check for updates."
echo "$PROPS bumped to $NEXT_NAME ($NEXT_CODE) — commit it."
