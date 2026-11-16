# Buddy website source

The static marketing assets are under `dist/`. They include original generated Creation-of-Adam-inspired ASCII hand artwork, self-hosted licensed fonts and the neutral Buddy theme. The app snapshot under `dist/app` and `dist/assets` is generated from the root app build, not committed.

Run `npm run website:build` from the repository root to build the app snapshot and prepare static Pages output at `output/website-pages`. GitHub Pages does not support `/api/voice`; the static build labels the live demo unavailable and does not start microphone capture.

For a server-backed deployment, `node worker/build.mjs` bundles the static assets and optional Deepgram WebSocket gateway into `dist/server/index.js`. Deploy that Worker with your hosting provider's runtime secrets. Set `VOICE_DEMO_ENABLED=true` and configure `DEEPGRAM_DEMO_KEY` as a secret only on the server. No live key, account ID, private hosting manifest, original repository history or provider billing configuration is included.

The gateway limits microphone PCM to 45 seconds, fixes the provider URL/model/diarization/training-opt-out parameters, checks origin and releases sockets. It does not persist audio/transcripts. Its per-isolate throttle is not adequate public multi-tenant abuse protection: add durable budgets before offering a shared key to public visitors.

`node --test worker/voice.test.mjs` verifies local boundaries. Browser scripts are local QA tools; they do not prove hosted or physical microphone acceptance. A live fixture script requires explicitly supplied public fixture audio and your own configured gateway.
