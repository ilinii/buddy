# Buddy website source

The static marketing assets are under `dist/`. They include original generated Creation-of-Adam-inspired ASCII hand artwork, self-hosted licensed fonts and the neutral Buddy theme. The app snapshot under `dist/app` and `dist/assets` is generated from the root app build, not committed.

Run `npm run website:build` from the repository root to build the app snapshot and prepare static Pages output at `output/website-pages`. GitHub Pages does not host `/api/voice`. With BUDDY_VOICE_GATEWAY configured, the trial calls the separate bounded public gateway; otherwise the static build omits the microphone trial and its scripts.

For a server-backed deployment, `node worker/build.mjs` bundles the static assets and optional Deepgram WebSocket gateway into `dist/server/index.js`. Deploy that Worker with your hosting provider's runtime secrets. Set `VOICE_DEMO_ENABLED=true` and configure `DEEPGRAM_DEMO_KEY` as a secret only on the server. No live key, account ID, private hosting manifest, original repository history or provider billing configuration is included.

The gateway limits microphone PCM to 45 seconds, fixes the provider URL/model/diarization/training-opt-out parameters, checks origin and releases sockets. It does not persist audio/transcripts. Its per-isolate throttle is not adequate public multi-tenant abuse protection: add durable budgets before offering a shared key to public visitors.

`node --test worker/voice.test.mjs` verifies local boundaries. Browser scripts are local QA tools; they do not prove hosted or physical microphone acceptance. A live fixture script requires explicitly supplied public fixture audio and your own configured gateway.


## Compact public website — 16 November 2026

The homepage combines the opening ASCII composition with the real 45-second voice trial. It has a single Explore Buddy hero link, one Record/Review/Ask workspace walkthrough, and managed-first setup choices. The owner-proposed managed price is $8.90/month, visibly marked Coming soon; subscriptions/billing/managed accounts are not implemented. API keys remain the second option.

The homepage is about half its previous height. The old standalone context section, static hero product preview and closing call-to-action block are removed. Cloud/privacy detail remains in the full privacy page; the trial's inline line reads only: No audio or transcript is saved by this demo.

Use BUDDY_VOICE_GATEWAY with the public gateway origin when running website:build to include the live trial. Without it, the build omits the trial and its scripts. The separately deployed durable public gateway is documented in ../voice-demo/README.md; the earlier per-isolate pilot above is retained as reference and is not the public service.

Serve the generated output and run BUDDY_SITE_URL=http://127.0.0.1:PORT node website/buddy-site/qa.mjs from the repository root. The functional QA checks six widths, page height/centering, merged context, tabs/keyboard/source dialogs, menu and reduced motion. It does not use a physical microphone or call a speech provider. Visual capture and the full-page style audit are separate checks.


## Download and FAQ follow-up — 17 November 2026

The primary hero/header link now downloads the real Windows x64 preview release. The header links to GitHub and refreshes the public star count without a token. The walkthrough has only Record and Ask your context. The second setup label is Use locally for free; optional BYOK remains in its content. Seven practical questions are restored in a glass accordion with progressive CSS open/close animation. The smaller phone header keeps the stars link and menu, with Download now in the hero. Release integrity and acceptance limits are documented in docs/WINDOWS_PREVIEW_RELEASE.md.
