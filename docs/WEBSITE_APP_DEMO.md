# Website app demo and download refresh

17 November 2026. The homepage now has a full-width guided meeting window and a real, on-demand app sandbox. The download page replaces the earlier large cards with a four-platform selection dock and a desktop/phone frame. All platforms remain **Coming soon**; there is no new installer release, signup or payment flow.

## Design references and source

The requested references were reviewed on their own published pages:

- [ReactDrops Fractal Glass](https://reactdrops.dev/components/image/fractal-glass): fluted glass, restrained refraction and hover reveals.
- [ReactDrops Chromatic Button](https://reactdrops.dev/components/button/chromatic-button): tactile reflections and responsive button material. Buddy retains a monochrome treatment.
- [Rare UI Step player](https://www.rareui.com/components/stepplayer): compact, stateful playback controls.
- [Rare UI Streaming Response](https://www.rareui.com/components/streamingresponse): progressive text sharpening and finite replay.

These are visual/interaction references. Their registry implementations were not imported or copied. The published terms include source-redistribution restrictions, so the public Buddy implementation is original CSS/JavaScript that remains under the project's AGPL license. No claim is made that these files implement the libraries' physical glass shaders. There are no new runtime dependencies or external decorative assets.

## Guided preview and actual app

`site/showcase.css` and `site/app-demo.js` provide a reusable window, reflective buttons, caption replay and a lazy app frame. The homepage keeps Record and Ask your context, illustrative questions and inspectable sources. Guided text is visibly sample content. The download dock supports pointer, touch and arrow/Home/End keys and changes the frame between desktop and phone proportions.

Try the app opens `/app/?demo=meeting&showcase=1`, the actual React UI. The full app bundle and SQLite worker are only loaded after that action. Visitors can edit notes, inspect transcripts and ask local source-based questions in sample meetings. Back to preview removes the frame. A new-tab link is provided. A delayed-load status gives a fallback if opening the frame is slow.

`isShowcase` is browser-only. The storage initialization flag makes the existing SQLite worker ephemeral: no persisted IndexedDB bytes are read and no snapshots are written. This keeps sample edits separate from an existing browser workspace. The frame denies microphone, camera and geolocation. The app shows a reset notice and Demo changes only after saves. The floating roadmap starts collapsed in this mode; its normal native/browser default stays open. There is no cloud key, live AI provisioning or native audio integration in this sandbox.

The existing website microphone trial remains separate, requires a deliberate Start action and uses the unchanged bounded gateway. No provider credits were consumed by the automated checks.

## Verification

TypeScript, all 62 existing unit tests and the production/static export passed. Both marketing workflows passed at 1440, 1024, 820, 768, 390 and 320 px. The actual-app workflow passed at desktop and phone widths: title/note editing, transcript navigation, a local answer, temporary-session reset, and unchanged bytes in a separately saved SQLite workspace. Its provider-request monitor remained empty.

Screenshots of both marketing pages and the actual sandbox were inspected at desktop and phone widths; tablet marketing screenshots were also reviewed. OS reduced motion, the page motion control, platform keyboard selection, image decoding and no horizontal overflow are covered by browser assertions. A static-only export continues to omit the separate voice trial. This is browser verification, not microphone, speaker-detection or Apple/Android device acceptance. No Rust/audio backend code was changed.

The app bundle retains the existing Vite size warning; loading it on demand keeps it out of the initial marketing-page request. The strict design-gate findings and exceptions are recorded separately; no full gate pass is claimed.

Live verification: GitHub Pages commit `d6a2440` serves both refreshed pages and the new app assets. All three workflows passed against `https://meetbuddy.me`: six-width marketing/platform checks plus desktop/phone real-app editing, transcript/local answer and storage-isolation checks. No speech or AI provider request was made by these tests. The homepage audit is `OPEN 48`; download audit is `FAIL 31` after two distinct review rounds (a third invocation reused unchanged results). Both sets of findings are recorded in the design audit documents; no full design-gate pass is claimed.
