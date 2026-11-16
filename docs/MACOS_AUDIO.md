# macOS recording implementation and acceptance

Source implementation: 11 November 2026. Minimum OS: macOS 13.0; Apple Silicon and Intel configurations. **Apple SDK compilation, Mac binaries and physical capture are not verified in this Windows environment.** The Rust ABI half is compile-checked here; that does not compile the Objective-C/framework half.

## Implemented

- Existing CPAL microphone capture plus an audio-only ScreenCaptureKit bridge (`native/macos_audio.m`), built into the app with Xcode's Clang via `cc`. No Python, virtual audio driver, separate helper installation or screen/video output is introduced.
- Separate microphone/computer tracks use the existing resampler, local Whisper/Groq/Deepgram engines, bounded buffers, consent rules, stop/pause, final-only journals and note-preserving recovery. The standard package includes Whisper Base. Cloud speech still requires explicit provider consent and a project key in the Mac Keychain; Windows credentials are not transferred to a Mac.
- ScreenCaptureKit requests 48 kHz stereo; borrowed float32 planar/interleaved buffers are validated and downmixed before entering the shared pipeline. Unexpected layouts, nonfinite samples and stale source timestamps fail visibly. The source host presentation clock accounts for callback delay; full drift correction is not claimed.
- All selected capture devices must be ready before audio enters processing and the session clock begins. This prevents a slower ScreenCaptureKit start from overflowing the microphone queue. Cancelled startup cannot arm capture afterward.
- Both the current process and the matching Buddy application are excluded from the system-audio filter. The actual effect on WKWebView playback, external speakers and microphone echo must still be tested on a Mac. Other applications' audio can be captured; headphones remain useful. No echo cancellation, speaker identity or automatic route switching is added.
- Permission state is visible in Recording / Settings → Audio. Microphone permission is requested through AVFoundation on the main thread; computer audio uses the macOS Screen & System Audio Recording permission. No permission prompt is triggered by capability queries. Denied/restricted access blocks recording before model preparation, capture or cloud connection.
- Explicit permission/settings actions, fixed settings destinations, refresh on app focus and relaunch instructions handle the OS permission lifecycle. Native start checks permissions again. Screen preflight does not distinguish unasked from denied, so its UI uses “Permission required” without inventing a more precise state. Only one pending request per source is allowed.
- Native startup is bounded. Teardown synchronously detaches Rust callbacks before freeing context; pending Apple callbacks retain their own state. A process-wide gate prevents overlapping starts while Apple's asynchronous teardown finishes. Capture errors interrupt visibly and preserve finalized text; full hotplug/sleep auto-restart is future work.
- Single-instance activation returns to the existing window. An OS-held advisory workspace lock additionally rejects another process's database load/save, including if activation handling fails. The persistent lock file is harmless after a crash because the OS releases the handle lock.

## Build on a Mac

Install Xcode Command Line Tools, Rust 1.90+ and Node 24+. These are developer prerequisites; they are not required by end users.

```bash
xcode-select --install
brew install llvm cmake
export LIBCLANG_PATH="$(brew --prefix llvm)/lib"
export BINDGEN_EXTRA_CLANG_ARGS="-isysroot $(xcrun --sdk macosx --show-sdk-path)"
export MACOSX_DEPLOYMENT_TARGET=13.0
npm ci
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --lib
# On Apple Silicon:
npm run desktop:package -- --target aarch64-apple-darwin --bundles dmg,app
# On an Intel Mac, use x86_64-apple-darwin instead.
```

Run `bash scripts/verify-macos-bundle.sh <path-to-Buddy.app> arm64` (or `x86_64`) to inspect architecture, minimum OS, privacy descriptions, linked audio frameworks and the pinned bundled model. This does not start recording or certify signing/capture. Launch the actual app bundle from Applications for permission testing: Terminal/dev runs may have different permission attribution, and rebuilding/re-signing can affect grants.

The native CI matrix now includes `macos-15` and `macos-15-intel`; packaging uses a native host per architecture. The package workflow inspects the bundle and creates a `ditto` app ZIP to preserve executable metadata. **These workflows were edited, not dispatched.** No paid runner, signing identity, certificate or notarization service was provisioned. There is no newly built Mac DMG to deliver from this host.

## Required Mac acceptance pass

- [ ] Compile/check/test/package on Apple Silicon and Intel; launch the actual `.app`, verify included-model preparation without a speech download and inspect the bundle.
- [ ] First launch: deny microphone, grant later in Settings, return/relaunch, refresh and record. Repeat for Screen & System Audio Recording. Confirm no capture/cloud activity before both selected sources are allowed.
- [ ] Record mic-only, computer-only and both sources using a second device/reference recording. Check real rolling Deepgram captions, final text after Finish, local Whisper operation and source timestamps. Set a project key through the app; never paste it into source or build commands.
- [ ] Play audio in another app and in Buddy; check the intended own-playback exclusion. Test headphones, speakers, silent output, Bluetooth changes and overlapping speech. Protected media may be excluded by the OS.
- [ ] Pause/resume repeatedly, immediately Finish/Cancel during startup/finalization, deny/revoke access, disconnect a display/device, sleep/wake and lose internet. Confirm visible failure, resource release, bounded retry and no late unexpected recording.
- [ ] Run 60–90 minutes; measure CPU/RAM, source drift, duplicates and missing audio. Inspect interrupted-session recovery and unchanged edited notes. Unretained/unfinalized audio is not recoverable after process exit.
- [ ] Launch twice, force-quit and reopen. Confirm a single active workspace, lock release, saved-key behavior and retained-audio deletion.
- [ ] Verify supported macOS versions, clean-machine installation/update and signing/notarization before a public consumer release.

## Verification performed here

Windows: `cargo check` and `cargo check --features check-macos-bridge` passed. The latter compiles the Rust macOS callbacks/permission handlers without linking Apple frameworks. Native suite: 34 passed, 4 existing opt-in tests ignored. New portable tests cover planar/interleaved PCM equivalence, malformed/NaN buffers, host-clock timestamps, startup backlog gating and exclusive workspace locks. Two Mac-only tests are prepared for non-recording native permission/ABI checks but were not run here.

Shared UI: TypeScript check/build and 42 unit tests passed; 69 relevant Playwright workflows passed (known PDF/DOCX workflow excluded). Simulated macOS workflows cover granted/denied permissions, blocked preparation/start, fixed settings commands, refresh after grant and shared Deepgram source handling at 1440/390px. Screenshots `output/macos-permissions-{1440,390}.png` are simulated native UI, not evidence of macOS capture. The Windows executable was rebuilt; startup, stored key and duplicate-launch handling passed without opening a microphone. The Mac bundle script passed Bash syntax checking only; no Apple bundle was available to inspect.

## Primary references

[Apple ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit), [audio capture configuration](https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/capturesaudio), [current-process audio exclusion](https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/excludescurrentprocessaudio), [Apple capture example](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos), [Core Media audio buffer ownership](https://developer.apple.com/documentation/coremedia/cmsamplebuffergetaudiobufferlistwithretainedblockbuffer(_:bufferlistsizeneededout:bufferlistout:bufferlistsize:blockbufferallocator:blockbuffermemoryallocator:flags:blockbufferout:)), [Tauri single-instance integration](https://v2.tauri.app/plugin/single-instance/), [GitHub native runner labels](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
