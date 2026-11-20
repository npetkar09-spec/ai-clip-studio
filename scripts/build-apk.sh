#!/usr/bin/env bash
# DRAFT, not yet run. Builds an installable Android APK without any local setup.
# It scaffolds a fresh Expo app (so versions always match), overlays our code, and builds a release APK.
set -euo pipefail
ROOT="$(pwd)"
rm -rf build-app
npx --yes create-expo-app@latest build-app --template blank-typescript --no-install
cp -r src/highlights build-app/src-highlights-tmp
mkdir -p build-app/src
mv build-app/src-highlights-tmp build-app/src/highlights
cp -r app-overlay/src/sample build-app/src/sample
cp app-overlay/App.tsx build-app/App.tsx
cd build-app
# Name and Android package id (edit the id if you publish later).
node -e '
const fs=require("fs");const p="app.json";const j=JSON.parse(fs.readFileSync(p,"utf8"));
j.expo.name="AI Clip Studio";j.expo.slug="ai-clip-studio";
j.expo.android=Object.assign({},j.expo.android,{package:"org.aiclipstudio.prototype"});
fs.writeFileSync(p,JSON.stringify(j,null,2));'
npm install
npx expo install expo-image-picker
npx expo prebuild --platform android --no-install
cd android
# arm64 only: faster build, and matches modern phones.
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon
echo "APK: $ROOT/build-app/android/app/build/outputs/apk/release/app-release.apk"
