#!/bin/bash
# Static package inspection only. Never opens a microphone or starts a stream.
set -euo pipefail
app_path="${1:?Pass the built Buddy.app directory}"
expected_arch="${2:?Pass arm64 or x86_64}"
if [[ "$(uname -s)" != Darwin ]]; then echo 'Requires a macOS SDK host' >&2; exit 1; fi
case "$expected_arch" in arm64|x86_64) ;; *) echo 'Unexpected architecture' >&2; exit 1;; esac
plist="$app_path/Contents/Info.plist"
exe_name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$plist")"
binary="$app_path/Contents/MacOS/$exe_name"
[[ -x "$binary" ]]
[[ "$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$plist")" == '13.0' ]]
for key in NSMicrophoneUsageDescription NSScreenCaptureUsageDescription NSAudioCaptureUsageDescription; do
  [[ -n "$(/usr/libexec/PlistBuddy -c "Print :$key" "$plist")" ]]
done
/usr/bin/lipo -verify_arch "$expected_arch" "$binary"
dependencies="$(/usr/bin/otool -L "$binary")"
for framework in ScreenCaptureKit AVFoundation CoreMedia; do
  [[ "$dependencies" == *"$framework.framework"* ]]
done
model="$app_path/Contents/Resources/models/whisper-base.bin"
[[ -f "$model" ]]
# Compare against the canonical catalog rather than duplicating the weight hash.
node --input-type=module - "$model" <<'JS'
import fs from 'node:fs';
import crypto from 'node:crypto';
const catalog=JSON.parse(fs.readFileSync('src-tauri/model-catalog.json','utf8'));
const models=Array.isArray(catalog)?catalog:catalog.models;
const model=models.find(m=>m.id==='whisper-base');
const actual=crypto.createHash('sha256').update(fs.readFileSync(process.argv[2])).digest('hex');
if(!model||actual!==model.sha256)throw new Error('Bundled speech hash does not match catalog');
JS
echo "Verified static macOS bundle: $expected_arch, permissions, frameworks, pinned model. Physical capture and signing are not established."
