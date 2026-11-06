#!/usr/bin/env bash
# Build the self-contained NOIR Android TV launcher: bundles the TV dashboard into the APK.
#   scripts/build-android.sh            -> android/app/build/outputs/apk/debug/app-debug.apk
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build -w @noir/tv -- --base=./ --outDir dist-android --emptyOutDir
rm -rf android/app/src/main/assets/web
mkdir -p android/app/src/main/assets
cp -R apps/tv/dist-android android/app/src/main/assets/web
cd android && ./gradlew assembleDebug -q
echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"
