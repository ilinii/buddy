# Testing and capability limits

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
```

The download workflow checks all four coming-soon platforms, homepage navigation, inline logo decoding with the former logo URL blocked, mobile menu/focus and reduced motion at six widths. It uses a GitHub metadata fixture and never starts cloud speech.
