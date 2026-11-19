# Testing and capability limits

## Workspace privacy and concurrency regressions (19 November 2026)

- Issues #2–#4: cancellable document batches across workspace deletion; assistant cancellation on provider/model/text/file-permission changes; exclusive browser workspace ownership before SQLite restoration. No Windows hardware/install acceptance is implied.
- `npm run check`, **64 unit tests**, production build and the tracked-source publication guard passed. The build retains its existing large-chunk advisory.
- All **15 focused Playwright workflows** in `knowledge.spec.ts` and `workspace-safety.spec.ts` passed. They cover permission revocation with deliberately late simulated native replies, safe second-tab rejection and owner-close handover, delete/save ordering, showcase isolation, and delayed real parser-worker results/batch cancellation at 1440 and 390 px. The deletion and tab-lock screens were visually inspected at both widths. No real provider, credential or physical audio was used.
- Full Playwright run: **117 passed, 1 failed** (6.3 minutes). The existing meeting-matrix screenshot check lost visibility of its canvas during reduced-motion capture. All **13 presence and workspace-safety workflows passed on rerun** (46.9 seconds), including that check. No matrix implementation/test was changed for the retry.
- Windows `cargo fmt --check`, `cargo check`, **55 native tests (5 opt-in fixtures ignored)** and `cargo check --features check-macos-bridge` passed. The new Gemini HTTP fixture cancels during a 429 backoff and confirms only one request reaches its localhost server. Sandboxed debug/release checks initially failed in the unchanged Whisper CMake probe with MSVC C1902; the debug check/tests passed with the compiler's local IPC available. The existing incremental hard-link fallback warning remains. The Mac bridge feature checks Rust ABI on Windows, not Apple frameworks; actual macOS/iPhone SDK checks were unavailable on this host.

```sh
npm run check
npm test
npm run build
npx playwright install chromium
BUDDY_PLAYWRIGHT_BUNDLED=1 npm run test:ui
```

Windows development may use installed Chrome. CI uses Playwright Chromium. Native checks are `cargo check --manifest-path src-tauri/Cargo.toml` and `cargo test --manifest-path src-tauri/Cargo.toml --lib`, with the platform's build prerequisites installed.

At publication, TypeScript, 62 unit tests and the production frontend build passed. The AGPL motion replacement passed 102/108 browser workflows in the broad run. After fixing live reduced-motion subscription, all six affected or timed-out workflows passed on rerun (43.2 seconds). These are browser/fake-device tests, not physical audio acceptance. See GitHub Actions for independent hosted results. Earlier native verification passed 52 tests, with five opt-in provider/model fixtures ignored in the ordinary run. The portable Mac bridge check is an ABI check, not an Apple SDK build.

Opt-in provider verification used public speech or synthetic text, not personal meetings: Deepgram finalized three public-speech passages with interim captions; NVIDIA returned four validated, source-linked draft items. These do not establish physical microphone quality, accurate headcounts or production privacy compliance.

Do not run ignored live-provider tests automatically in public CI or upload real recordings for tests. Keys belong in your own native credential store. Packaging, browser simulations and successful compilation are not physical-device acceptance.

Website-specific checks after `npm run website:build` and a local static server:

```powershell
$env:BUDDY_SITE_URL='http://127.0.0.1:1446'
node website/buddy-site/qa.mjs
node website/buddy-site/download-qa.mjs
node website/buddy-site/app-demo-qa.mjs
```

The download workflow checks all four coming-soon platforms, homepage navigation, inline logo decoding with the former logo URL blocked, mobile menu/focus and reduced motion at six widths. It uses a GitHub metadata fixture and never starts cloud speech.

The app-demo workflow opens the actual React app on desktop/phone, edits a note and title, reads the transcript and obtains a local source-based answer. It hashes a separately persisted SQLite snapshot before/after the sandbox session and verifies reload reset. No real microphone or provider call is used.
