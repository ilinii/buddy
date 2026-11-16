# Buddy for iPhone

The iPhone source target uses the same Tauri 2 / React / Rust application as Windows and macOS. This is an iOS 17+ target, not a separate web service or an Android port. The first build must be made on a Mac with full Xcode. No IPA has been built or signed on the Windows development machine.

## What is implemented

- Touch layout with a glass bottom navigation bar, 44+ px primary controls, safe-area padding, keyboard-aware height, full-width notes, Settings sheets, light/dark themes and the existing reduced-motion controls.
- Meeting history, editable personal notes, transcript review, actions, explicit Files picker imports, evidence-backed questions and the disconnected Ask/Search launcher reuse the existing application. Demo content stays labeled and separate from real evidence.
- Native microphone permission via AVFoundation, a PlayAndRecord audio session and CPAL input feeding the existing bounded audio/DSP/ASR engine. iPhone sessions force microphone-only and the OS audio route; desktop loopback preferences do not leak into them.
- Deepgram streaming, Groq chunks and optional downloaded on-device Whisper reuse native providers. Credentials use Apple Keychain, not web storage. No project credentials are bundled. Cloud audio and document permissions still apply; recording does not implicitly enable cloud processing.
- The microphone audio background mode is declared. Calls, lost audio routes and media-service resets request safe engine finalization rather than silently resuming over missing speech. Returning to Buddy refreshes the native snapshot, including finalized segments the webview may have missed while suspended.
- The workspace directory is excluded from device backups and uses iOS protection until first unlock, allowing explicitly started capture to finish while locked. Notes, audio and retrieval cache remain in the app sandbox. Uninstalling removes that sandbox; no account sync is implemented.
- Exports use the native share sheet, with temporary-file cleanup after dismissal and a 5 MB limit. The existing Keepsake icons are reused.

## First build on your Mac

Prerequisites: Xcode with an iOS platform/Simulator installed, Node 24, Rust stable 1.90+, CMake and libclang. If Xcode requests first-launch components or a license, complete those in Xcode. Install CocoaPods if the Tauri initializer requests it. These are developer build prerequisites; end users will not install these tools.

Copy/clone this repository to the Mac, excluding Windows `node_modules`, `.toolchain` and build output. From the Buddy folder:

```sh
npm ci
npm run ios:setup
npm run ios
```

`ios:setup` adds the device and host simulator Rust targets, then runs Tauri's official iOS initializer. It leaves an existing Xcode project intact. The initializer generates `src-tauri/gen/apple/project.yml` and the Xcode project using the iOS-specific configuration, microphone description and existing icons. That generated folder is ignored, so local signing edits are not committed.

Choose an available iPhone simulator when prompted. For a physical iPhone, use your own Apple signing team in Xcode or the `APPLE_DEVELOPMENT_TEAM` environment variable; connect and trust the phone and enable Developer Mode if Xcode requests it. No signing account, paid membership, App Store listing or TestFlight deployment has been provisioned. A personal development run and App Store distribution have different Apple signing requirements.

The Vite server follows `TAURI_DEV_HOST` for physical-device development; it otherwise stays on loopback. Use the development server only on a trusted development network. Production uses packaged assets and the existing restrictive CSP.

For a simulator SDK source check, without publishing:

```sh
npm run build
npm run ios:check
```

The check sets the simulator sysroot for speech bindings/CMake. Set `LIBCLANG_PATH` to your installed LLVM library directory if bindgen cannot find libclang. `npm run ios:build` delegates to Tauri's iOS build after initialization; use its target/signing options for the intended build. The manual `iPhone SDK check` GitHub workflow provides the same source check on an Apple runner; it has not been dispatched or verified here.

## Current boundaries and acceptance checks

The iPhone and desktop workspaces are separate. There is no automatic meeting sync. iPhone does not capture other apps' system audio, phone-call audio or desktop Ollama models. Source-excerpt drafting and configured cloud questions are available; local Ollama drafting stays desktop-only. Local Whisper Base downloads about 148 MB once (Small about 488 MB); RAM, speed, battery and thermal behavior have not been measured on iPhone. This target does not bundle desktop model weights.

Windows validation covers the shared frontend, iPhone-sized browser/IPC simulations and Rust bridge types. It cannot validate Objective-C against an Apple SDK, WKWebView behavior, signing or actual iPhone capture. Before treating this as release-ready, verify on an iPhone:

- First launch, VoiceOver navigation, increased text size, dark theme, reduced motion and safe areas in portrait/landscape.
- Type a note with the software keyboard, background/reopen, and confirm saved text survives.
- Deny/allow/revoke microphone permission; start/stop repeatedly and confirm the microphone indicator stops.
- Record, pause, lock/unlock, answer a call and unplug Bluetooth/wired headphones; confirm interruption warnings, no silent transcript gaps or resumed recording, and saved source IDs/timestamps.
- Deepgram interim/final captions, offline/reconnect, stop-drain and recovery after force quit. No background-network guarantee has been validated.
- Model download cancellation, local Whisper memory/thermal behavior, file imports, source evidence, Keychain persistence and native share/export cleanup.

Apple's [Tauri iOS prerequisites](https://v2.tauri.app/start/prerequisites/) and [signing guide](https://v2.tauri.app/distribute/sign/ios/) describe the toolchain and distribution boundary. CPAL documents its [iOS CoreAudio backend](https://docs.rs/crate/cpal/0.18.2/source/README.md); keyring documents [Apple Keychain support](https://docs.rs/keyring/3.6.3/keyring/). These establish platform support, not successful integration in Buddy.
