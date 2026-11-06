#!/usr/bin/env bash
# Publish a NOIR Android update that installed launchers pick up automatically.
#
#   scripts/release-android.sh "What changed in this version"
#
# Requires: android/signing.properties + android/noir-signing.keystore (the permanent NOIR key),
# `updateRepo` set in android/noir.properties, and an authenticated `gh` CLI.
# Builds the version in android/noir.properties, publishes it as a GitHub release with
# noir-launcher.apk + noir-update.json, then bumps noir.properties to the next version.
set -euo pipefail
cd "$(dirname "$0")/.."
NOTES="${1:-Improvements and fixes.}"
PROPS=android/noir.properties
get() { grep -E "^$1=" "$PROPS" | head -1 | cut -d= -f2- | tr -d '[:space:]'; }
CODE=$(get versionCode); NAME=$(get versionName); REPO=$(get updateRepo)

[ -f android/signing.properties ] || { echo "Missing android/signing.properties (the permanent NOIR signing key). Upload it first."; exit 1; }
[ -n "$REPO" ] || { echo "Set updateRepo=owner/repo in $PROPS first."; exit 1; }
if gh release view "v$NAME" --repo "$REPO" >/dev/null 2>&1; then echo "Release v$NAME already exists — bump $PROPS."; exit 1; fi

./scripts/build-android.sh
OUT=dist-release && rm -rf "$OUT" && mkdir -p "$OUT"
cp android/app/build/outputs/apk/release/app-release.apk "$OUT/noir-launcher.apk"
SHA=$(sha256sum "$OUT/noir-launcher.apk" | cut -d' ' -f1)
node -e '
const [code, name, repo, sha, notes] = process.argv.slice(1);
const m = { versionCode: Number(code), versionName: name, sha256: sha, notes,
  apkUrl: `https://github.com/${repo}/releases/download/v${name}/noir-launcher.apk` };
require("fs").writeFileSync(process.argv[6], JSON.stringify(m, null, 2) + "\n");
' "$CODE" "$NAME" "$REPO" "$SHA" "$NOTES" "$OUT/noir-update.json"

gh release create "v$NAME" --repo "$REPO" --title "NOIR $NAME" --notes "$NOTES" --latest "$OUT/noir-launcher.apk" "$OUT/noir-update.json"

# Prepare the next version number.
NEXT_CODE=$((CODE + 1))
NEXT_NAME=$(echo "$NAME" | awk -F. '{ printf "%d.%d.%d", $1, $2 + 1, 0 }')
sed -i.bak -e "s/^versionCode=.*/versionCode=$NEXT_CODE/" -e "s/^versionName=.*/versionName=$NEXT_NAME/" "$PROPS" && rm -f "$PROPS.bak"
echo "Published v$NAME (code $CODE). Launchers will offer it within a few hours, or immediately via Settings → System → Check for updates."
echo "$PROPS bumped to $NEXT_NAME ($NEXT_CODE) — commit it."
