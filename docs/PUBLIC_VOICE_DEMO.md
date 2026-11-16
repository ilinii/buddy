# Public website voice demo — 16 November 2026

The owner explicitly approved use of the existing Deepgram credential for anonymous public samples, with a 45-second/sample limit, 20 starts per UTC day and 100 lifetime. Three starts per daily network hash apply too. The separate public Sites gateway keeps the key and HMAC salt in runtime secrets. The original owner-private Site and its secret/audience were not changed; no billing or paid plan was enabled.

The static site and browser capture code contain only the public gateway origin. A short-lived one-use ticket reserves quota before any provider connection. SQLite/D1 enforces the caps in one atomic write across isolates. Quota rows contain no speech, transcript, raw IP or API key. The gateway pins the provider endpoint/model and privacy option, bounds PCM bytes/frames/time/buffers, and drains final words on Stop. Origin controls complement a hard global budget; they do not authenticate visitors or prevent a determined attacker from exhausting the small allowance. The service fails closed if its secret, database or trusted connection address is unavailable. See website/voice-demo/README.md.

The website artwork uses an original generated transparent master with separated right-hand fingers, compiled to the same alpha/luminance ASCII field. Existing whole-hand motion and reduced motion remain. The product frame was lowered slightly so it does not cover the fingers. The live trial sits in its own section reached by Try your voice.

Checks: TypeScript, all 62 application unit tests, app/static build, five gateway tests passed. Real SQLite tests cover concurrent cap reservations, lifetime/day/network boundaries, single-use and expired tickets, and daily keyed hashes. Relay tests exercise fixed provider/privacy parameters, byte bounds and inert transcript data. Browser fake-device tests at 1440/390/320 passed explicit start, rolling captions, PCM frames, final drain, speaker estimates, CORS quota errors and no overflow/page errors. These simulated-provider tests are distinct from live inference or physical microphone acceptance.

The design skill whole-page audit remains open; its findings concern existing headline/button/spacing/sample-label conventions as well as page composition. Demo labels are deliberately retained to distinguish fictional product examples from actual live speech. This scoped hand/demo update does not claim a full design-gate pass. Detailed local reports are not published with recordings or secrets.

Provider references: https://developers.deepgram.com/trust-security/your-data and https://developers.deepgram.com/docs/close-stream . The demo requests model-improvement opt-out; it makes no claim of end-to-end encryption or a blanket guarantee about other Buddy providers.

## Deployed inference verification

The actual public Sites gateway streamed the existing 11-second public JFK fixture to live Deepgram: 110 PCM packets, nine interim updates, first at 1,957 ms, three finalized passages, normal close code 1000 and successful Stop/drain in 13,135 ms. No physical microphone, user recording or meeting data was used. An initial 403 revealed that HTTP and WebSocket used different egress addresses. Short-lived bearer tickets fixed that transport sensitivity while retaining atomic quota reservations and one-use expiry. The failed attempt still counted; no quota rows were deleted or refunded.

GATE: OPEN 76 (rounds used up). Three design-skill review rounds were run. The whole-page findings remain documented separately; this is a scoped artwork/demo delivery, not a complete site redesign or a passing full-page audit. No waivers were added.
