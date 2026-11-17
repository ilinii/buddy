# Architecture

Publication note: descriptions of Animate UI below record the earlier prototype. The AGPL release uses Buddy-owned motion controls with Motion and Base UI; restricted registry implementations and private hosting metadata are excluded.

## iPhone source target (2026-11-12)

Buddy now has a Tauri iOS 17+ target sharing the React UI, SQLite snapshot service, Rust provider/retrieval engine and bounded audio pipeline. `src/platform.ts` distinguishes native execution from iOS recording policy; storage/provider integrations use `isNative`, so a native iPhone is not classified as a browser preview. Desktop window sizing and single-instance registration are gated to desktop. `tauri.ios.conf.json` and `Info.ios.plist` supply the phone window, mic usage description and audio background mode; iOS has a separate minimal capability file.

`engine/ios.rs` and `native/ios_audio.m` manage microphone authorization, AVAudioSession, interruption/route/reset flags, app-sandbox protection/backup exclusion and a bounded temporary-document share sheet. CPAL captures mic PCM into the existing per-source normalization/ASR/journal path. iOS never advertises system audio, and Rust permission validation rejects it. UI refresh on foreground reconciles native final segments missed during webview suspension. No webview arbitrary path/URL, automatic provider switching, bundled provider secret, sync service or Android target was introduced.

`PhoneNavigation.tsx` / `phone.css` provide the touch bottom bar, safe areas, keyboard-visible height, notes and sheet layouts using the existing neutral glass theme and Animate UI selection tokens. This implementation is verified in browser simulations and via Windows Rust type checks only. iOS SDK/linking, signing, WKWebView and physical-device acceptance remain open; see [IPHONE.md](docs/IPHONE.md).

## Current execution model

```text
React UI → application service interfaces
  ├─ meeting/model.ts       Zod schemas, stable IDs, revision and evidence rules
  ├─ meeting/demo.ts        clearly identified deterministic replay
  ├─ audio/capture.ts       browser MediaRecorder microphone capture + analyser
  ├─ engine/client.ts       typed native commands/events, idempotent journal merge
  ├─ engine/notes.ts        evidence validation, review/apply, edit protection
  ├─ native engine/         CPAL + WASAPI → per-source 16 kHz → bounded local ASR
  ├─ assistant/            shared evidence corpus + offline / Gemini / NVIDIA adapters
  ├─ documents/            selected-file extraction in disposable workers
  └─ storage/              serialized RPC → dedicated SQLite WASM worker
                              ├─ browser: exported DB → IndexedDB transaction
                              └─ Tauri: exported DB → fixed app-data SQLite file
```

SQLite is the actual query engine, including FTS5; IndexedDB stores its serialized bytes in the browser. Tauri uses the same SQLite database image, atomically replaced by the Rust host at a fixed app-data path. No filesystem plugin is exposed to the frontend or model. Native code never accepts arbitrary paths. No data is persisted in localStorage.

The snapshot design is intentionally small-scale. It has a native 50 MB ceiling and rewrites the database image on save. It is not an efficient large-corpus storage architecture. Meeting saves coalesce to the latest pending revision per meeting, with at most 16 distinct meetings waiting. Move the service implementation to native incremental SQLite commands before large datasets; the repository interface and schema remain applicable. Native duplicate launches are handled by the single-instance plugin, backed by a process-lifetime OS file lock on database load/save. Browser windows are still not coordinated; use one browser workspace window.

## Canonical meeting data

`Meeting` owns timestamped segments, events, and note blocks. A generated block can cite final transcript `evidenceIds` directly; verbatim excerpts and summary paragraphs do not create invented roadmap moments. Structured decision/action/question items create separately validated events after review. Every event cites existing final segments, has a start/end inside their evidence interval, and refers only to known relationships. Qualitative evidence states are explicit, inferred, unresolved, or needs verification. They are not numerical confidence probabilities. The editor and roadmap consume the same meeting events.

Meeting metadata also includes `participants: { id, name }[]`, limited to 24 explicitly user-entered names (80 characters each). The Zod loading schema defaults older JSON to an empty list. This metadata persists in the canonical meeting JSON without a new SQL table/migration; no speaker recognition, attendance inference, invitation or identity service is implied. Changing people reads the latest meeting snapshot and preserves note revisions and evidence. Copy/export includes a clearly labelled manual-name list.

Each note has a stable ID, revision, author and timestamp. User edits increment revision and lock that block against synthesis replacement. Incoming replay blocks preserve user versions. The production synthesis merge helper rejects stale revisions and protects user edits. Repeated event IDs replace prior versions rather than duplicating them.

The home Take notes action creates a manual capture container with optional semantic `kind: note`, title New note and a user-owned Tiptap block. Old records without kind remain readable; manual records are recognized as notes. Recording changes capture mode to microphone while preserving note kind, title, IDs and user edits. The note action starts microphone-only capture directly and bypasses only the meeting-participant checkbox, leaving provider key/cloud-audio checks intact. It explicitly overrides microphone/system capture choices for that session without changing meeting preferences. macOS requests microphone access on first use, without requesting system-audio access. Device/preparation failures remain inline; cancellation cannot start late. `TextEffect` incremental mode keys provisional words by position/text, retaining stable prefix nodes and animating only appended/corrected words. Native finalized evidence and user-authored note revisions remain separate.

SQL migration 1 creates meetings, segments, events, blocks, relationships, actions, source references, documents/FTS chunks, settings, AI tasks, and migration history. Parent deletion cascades. Meeting JSON is the loading representation; normalized tables are transactionally materialized for future queries. AI-task persistence is reserved in the schema; current chat messages are session-only and are not restored after restart.

## Independent work loops

Pipeline A currently consists of either real microphone capture or deterministic sample replay. It is independent of assistant requests. The sample replay synthesizes authored fixture blocks; it is not speech recognition or an LLM extractor. Real microphone recording stores no fake transcript/events. On an unexpected close, saved live/paused meetings become interrupted when reopened; recording never restarts automatically.

Pipeline B builds the shared scoped transcript/note/document corpus. Offline mode returns keyword-ranked excerpts; NVIDIA uses focused context or hybrid retrieval before generating cited answers. Both paths can be canceled; the NVIDIA native service permits one active request globally. Existing document FTS5 remains available. One request is allowed per assistant panel. Gemini adds a native mutex (one inference at a time), 4-second minimum spacing, 25-second per-request timeout and bounded retries for 429/5xx. Canceling a native request discards its result; the outstanding HTTP request may finish or time out. No claim of server-side cancellation is made.

Document parsing runs outside the UI thread, one selected file at a time. Each extraction worker has a 30-second timeout, 20 MB input ceiling, 1,000,000-character extracted-text ceiling and 1,500-chunk ceiling; PDFs are limited to 200 pages. No model gets filesystem, shell, process, write, or arbitrary URL tools.

## Sources and retrieval

Selected folders are File API snapshots. Import IDs derive from the selected source group and validated relative path, so reimport replaces matching entries rather than duplicating them. A successful folder refresh replaces the group and removes files absent from the new snapshot. On extraction errors, successful updates are retained and missing entries are preserved to avoid silent data loss. There is no ambient directory watching or persistent folder handle.

TXT/MD citations preserve extracted line ranges. DOCX preserves paragraph order, not Word page numbers. PDFs preserve page numbers; scanned pages need OCR. CSV/XLSX preserve sheet/row/cell coordinates. XLSX uses stored values, including cached formula values where available; it does not evaluate formulas. Empty or unreadable content fails visibly.

Demo documents are real bundled fixtures explicitly labeled fictional. Real meeting requests exclude demo document chunks and demo meeting history. Offline answers quote indexed source text; they do not invent calculations, external facts or file matches. Cloud answers validate citation IDs against the supplied allowlist, but citation validation alone does not verify entailment.

## Native boundary

Allowlisted commands: load/save a SQLite image in the fixed application directory, set/check/delete the OS-keystore Gemini credential, and issue a bounded request to the fixed Google Gemini endpoint. The key is never returned to JavaScript or persisted in SQLite. A user-triggered `open_notification_settings` command launches a fixed Windows notification settings URI or macOS System Settings; it accepts no path, URL or command argument and does not toggle OS focus state. Native commands also expose fixed model catalog/install/cancel, device capabilities, session start/pause/stop/status/recovery/deletion, and local note-model discovery/generation/cancel. Speech model IDs, URLs, revision, byte lengths and SHA-256 values are allowlisted. No arbitrary path/URL/shell interface is exposed. Physical permissions/capture still require device verification on each OS.

## Future extensions

The native `SpeechBackend` currently wraps CPU Whisper behind a stable transcript contract. Browser `AsrBackend` stays unavailable. Neural VAD, overlap reconciliation, device-switch recovery, Mac system capture, long-meeting synthesis and large-library incremental SQLite remain separate work. See docs/AUDIO_AND_ASR.md.

Semantic retrieval, licensing, subscriptions, team sync and accounts can be added behind separate interfaces. None is required by the current offline workspace.


## Optical UI materials

`Logo` reads the local Keepsake mark from `public/brand/keepsake-mark.png`; it is decorative within the existing labelled navigation controls. High-resolution Imagegen masters live in `assets/brand/`, outside the public app payload. Tauri-generated platform icons and the PNG favicon use the approved dark-tile version. Windows setup embeds the same local mark as a manifest resource; the Mac artwork renderer waits for the local image to decode. Branding introduces no service, runtime image generation or remote image request. The matrix launcher is independent of the logo.

`src/ui/modern.css` owns the compact navigation rail, header recording controls and meeting rows. `MatrixCube.tsx` / `matrixRenderer.ts` replace the sphere with a deterministic 1,331-point cube. The component keeps the historical `Orb` export as an alias for assistant/onboarding callers. Dispersion is visual only: pointer/focus state updates a bounded GPU deformation field, with immediate static endpoints under reduced motion. Click/key/touch activation opens the meeting navigator; touch explicitly clears sticky hover/focus. Capture/request status remains real application state, and no preview gesture starts capture.

WebGL draws cap at 30fps, DPR 1.5 and a 640px buffer; hidden/offscreen surfaces stop drawing. Cleanup releases buffers, shaders, observers and event listeners. A three-face CSS matrix remains visible without WebGL. There is no remote renderer, texture download or new dependency. A compact named rail navigates the existing pages; home renders each record once from canonical meeting data. The old grey-sidebar shortcuts and latest-meeting duplication are removed.

`Roadmap` reads the same typed meeting events for timeline and graph. The graph has its own metadata wrapper so expanded timeline grid rules cannot alter node content. Compact scrolling observes track size/position to enable previous/next controls; scroll motion respects OS/app preferences. Selection opens the existing evidence inspector without changing canonical events. Graph node data carries the original typed event, and relationship edges retain actual `relatedIds`; layout is presentation only. Saved-meeting date markers read the actual meeting date.


`ui/motion.ts` wraps explicit navigation/view changes with a feature-detected document view transition. React updates flush inside the snapshot callback; core recording/storage loops are untouched. Unsupported/reduced-motion paths update directly, interruption skips the older transition, and rejected/skipped visual snapshots do not block the DOM callback. CSS scopes snapshots to the main workspace, leaving navigation outside the animated region. Timeline/graph evidence IDs and note revisions are unaffected. Meeting sheets preview actual stored note text through plain-text extraction when no decision exists; it never manufactures content for microphone capture.


`MeetingNavigator.tsx` is a presentation-layer dialog reading canonical saved meetings. Local search matches title, tags, plain note text, segments and events; it creates no index or network request. Selecting a result uses existing meeting navigation. Its question path requires a meeting and passes a uniquely identified unsent draft into `Assistant`; existing Send/provider/citation boundaries remain responsible for answering. No cloud-file consent or microphone behavior changes.

The navigator's current action is a small CSS black-gradient circle using Animate UI Button; the earlier ReactDrops material is no longer imported by the application. `MotionRail` uses Animate UI Button/Highlight, with Motion for the existing custom sheet and mobile rail. Motion reads the shared tokens and reduced-motion context; no Tailwind/shadcn rewrite or primitive import codemod was needed. License notices are copied into the application’s public third-party directory.

`settingsSchema.focusMode` defaults false for old settings and persists through the existing storage boundary; no SQLite schema migration or server is required. The focus UI pauses ambient renderers, hides non-critical badges/completion feedback and collapses optional meeting panes on entry. It never suppresses recording controls, parsing progress or critical errors. It does not receive OS notifications, poll notification content, or claim system-wide suppression. See `docs/ANIMATION_REVIEW.md` for the Windows Limited Access Feature constraint and actual platform settings behavior.


The current route union and rail have home, meeting, actions and knowledge; there is no separate Decisions route. Canonical decision events are retained. The launcher defaults to a question with visible meeting context, with disconnected search controls and no outer card. `SourceExcerpt.tsx` presents inert React text/limited Markdown headings and lists; no HTML, remote media or link execution is introduced. Route presentation uses only the existing view transition: removing `.page-enter` prevents its CSS animation from restarting when the view-transition flag clears. Storage and provider boundaries are unchanged.


Launcher-only clarification: `Modal.transparentBackdrop` leaves the full-screen dismissal hit area visually clear (zero alpha and no backdrop filter); other dialogs retain their blurred backdrop. The visible meeting selector is removed. Ask keeps the meeting context captured on opening (current meeting, otherwise the first saved meeting), and still hands off an unsent draft to that meeting. Selecting a different context happens by opening a meeting through Search. Only the independent Ask/Search chips and input surface have glass styling; their parent has no painted background.

## Capture UI and shared controls

`RecordingStage` consumes the existing capture status, elapsed seconds and microphone analyser RMS; it does not create transcript segments. Its canvas is decorative, bounded to 30 fps / DPR 1.5 / approximately 900k pixels, and stops its RAF while paused, hidden, offscreen, under OS/app reduced motion or in Buddy focus mode. Observers and RAF are removed on unmount. Demo passages are keyed by their real fixture segment IDs/timestamps; no simulated typing or fixture text is introduced into real microphone meetings.

The recording UI is a compact, document-aligned strip: status, timer, short signal, pause/resume/finish and the capability label. Demo text appears by default in a two-line, source-timestamped preview; the complete passage remains accessible through View transcript. It is keyed to actual incoming fixture segments and the supplied TextEffect reveals its words once on arrival. A newly started capture closes the assistant (which remains available on request), and empty compact roadmaps do not displace live microphone notes. On entering a narrow layout an open assistant overlay closes. The existing microphone permission, cleanup, byte limits and audio separation are unchanged.

`AnimatedControls` composes the actual Animate UI Base UI checkbox, combobox and alert-dialog primitives, plus the animated copy primitive. Clipboard confirmation follows an awaited browser write and failures remain visible. Device selection commits an actual item value, not typed filter text. Nested Escape is handled before the custom Settings modal; alert dialogs focus the safe cancel action and await successful storage deletion before closing. Other custom modals keep their existing focus/dismissal implementation.

Official Liquid Button and Glyph registry source is adapted locally for CSS styling; sources, hashes and deviations are in `src/ui/animate-ui/provenance.json`. Glyph is lazy-loaded only for welcome, has a 30 fps / DPR 1.5 / approximately 1.5M pixel bound, pauses when hidden/offscreen/reduced, and releases its WebGL resources on unmount. It is decorative and optional: unavailable WebGL leaves entry controls working. The supplied TextEffect was adapted to the existing Motion runtime without adding Tailwind or a second animation runtime. Accessible text is kept as a coherent static copy while visual word spans animate.

## Native recording pipeline (2026-11-11)

`engine_start` reserves one session and verifies the selected model before loading it. Meeting identity is saved before capture begins. CPAL and Windows WASAPI run on capture threads; float PCM enters a 128-frame bounded channel. Microphone and render-loopback sources are never mixed. Per-source sinc resamplers produce 16 kHz mono, preserving duration including the filter tail. Energy-based endpoints prefer silence after two seconds and force a chunk at twelve seconds. One ASR worker consumes at most six queued chunks; pressure stops capture visibly, preserves the pending chunk and drains it on finalization. Capturing and inference do not block the React thread. This describes the local/Groq bounded-chunk branch; Deepgram now has the separate streaming branch described below. No neural VAD has been added to local capture.

A monotonic session clock excludes pauses and freezes when capture stops. Stable finalized segment IDs include session/source/batch/index. Version-1 journal snapshots contain source IDs/times, model/language/source provenance and status; each finalized passage/state is atomically saved outside SQLite, with five-second checkpoints. Recovery merges the latest 100 journals by ID and preserves personal notes; it never restarts capture. Same-session event sequences discard stale transport events. Snapshot reconciliation repairs missed events. Stop joins capture, flushes resampler/WAV tails, drains inference and only then publishes completion. Cancellation retains existing segments and marks interruption. A four-hour session bound limits resources.

Raw audio is written only when explicitly retained, as separate 16-bit/16 kHz WAV files under fixed app-data session directories. The UI does not yet provide native WAV playback/export; browser downloads remain separate. Deleting a captured meeting removes its journal/audio; delete-all clears session history. Models remain a reusable cache. Database-image persistence still has the documented 50 MB ceiling; a native incremental SQLite migration remains necessary before large libraries.

Local note generation uses only fixed `127.0.0.1:11434` Ollama endpoints, with proxies/redirects disabled and remote/cloud model metadata rejected. It never pulls a model. Requests are explicit, serial, cancellable, time/size bounded and tool-free. Drafts are validated in Rust and TypeScript against final source IDs; decision/action claims are marked for verification. The review shows original passages. HTML is escaped, and an edited generated block cannot be replaced. Exact ID validation does not prove semantic accuracy. No actual Ollama model was available for an inference test.

## Automatic preparation and distribution

The compiled catalog lives in `src-tauri/model-catalog.json`, shared with the release builder. `engine_prepare_model` reserves a request-scoped, cancellable preparation job before any meeting is created or microphone opened. It verifies the cache, atomically prepares a valid included resource, or uses the pinned resumable download fallback. Progress carries the request UUID. Early cancellation is remembered in a bounded queue; stale cancellation cannot affect a new job. The frontend also checks its abort signal after completion, preventing late preparation from starting capture after the user cancels/leaves the dialog. The existing recording-start command rechecks the artifact before use.

The offline Tauri config maps the base model and notices into the platform resource directory: alongside the installed executable on Windows, inside the app bundle on macOS. No arbitrary resource path is accepted over IPC. Windows builds statically link the C++ runtime. The packaging helper prepares/verifies the model before invoking the Tauri bundler; binaries/weights stay ignored. The manual packaging workflow targets Windows x64 and macOS Intel/Apple Silicon; it has not been run on GitHub or a Mac. Packaging configuration alone does not establish Mac capture behavior or signing.

`recordingSetupVersion` migrates earlier development defaults once to local transcription on; a subsequent explicit audio-only preference stays off. Source excerpts remain available without a language-model service. Ollama generation is optional and is not provisioned by speech preparation.


## Optional Groq speech backend (2026-11-11)

`engine/groq.rs` implements `SpeechBackend` with the fixed Groq Whisper large-v3-turbo upload endpoint. `StartRequest.speechProvider` defaults local for old IPC callers; `cloudAudioConsent` defaults false and is checked natively before capture. A selected Groq recording reads its separate OS credential and bypasses model verification/preparation; no key enters the serialized request, journal or snapshot. Native worker configuration carries only an in-memory credential. Browser preview remains audio-only.

Cloud requests use source-separated 16 kHz WAV buffers and 10–20-second endpoints, fixed metadata, cancellable/time-bounded HTTP, capped retries/response sizes and validated timestamp evidence. The existing bounded queue, stop drain and journal/recovery boundaries apply. Provider failures interrupt capture explicitly; they do not switch engines. The existing `localTranscription` preference retains its historical storage name and now means transcription enabled for the selected engine. Details and unverified acceptance work: docs/GROQ_TRANSCRIPTION.md.


## Deepgram streaming branch (2026-11-11)

`engine/deepgram.rs` is a persistent streaming service alongside the batch `SpeechBackend` boundary. `SpeechProvider::Deepgram` requires native cloud-audio consent and its own OS-stored key, then opens one fixed Nova-3 WebSocket per selected source before starting devices. CPAL/WASAPI and the existing resampler feed 100 ms PCM16 packets, rather than the local/Groq chunk queue. Sessions record `deepgram/nova-3` provenance; no key enters events, journals, SQLite or settings.

Each stream owns a bounded input queue and 30-second unfinalized packet timeline. Keep-alives, pause Finalize, ordered CloseStream and a bounded final-response drain are independent of UI rendering. Reconnection replays only uncommitted samples with fixed pacing and timestamp remapping. Response limits, redacted authentication/quota failures, cancellation, bounded retry and missing microphone delivery handling interrupt visibly on failure. WASAPI silence alone does not trigger a watchdog failure. Source-gap mapping is implemented; full hardware-clock drift correction and hotplug restart are not.

Typed `interim` events include their source and remain in React state only; changing words do not replay entrance animations. Only final word-timestamp-validated segments go into the atomic journal and meeting evidence. Anonymous `speaker` labels are optional schema additions, scoped to source/connection and never mapped to user participant names. Existing saved meetings migrate without speaker fields. See docs/DEEPGRAM_TRANSCRIPTION.md for limits and actual test evidence.


## macOS source integration and workspace ownership (2026-11-11)

`engine/macos.rs` bridges to the private C ABI in `native/macos_audio.{h,m}`. `build.rs` compiles Objective-C with ARC/blocks and links Apple frameworks only for macOS. The declared minimum remains 13.0. ScreenCaptureKit registers only an audio output, filters the Buddy application/current process, validates borrowed float32 plane buffers and forwards mono source frames with host-clock-derived capture offsets. No native pointer escapes a synchronous audio callback.

The serial native state/delivery queue owns stream transitions. Destroy synchronously detaches callbacks before Rust frees their context; asynchronous startup/stop retains native state and a process-wide startup permit until completion. A hung Apple operation therefore prevents another driver start instead of piling up resources. Selected devices must all report ready before the shared capture gate opens and the recording clock resets. Native errors remain fixed/redacted; automatic driver restart is not claimed.

Capabilities distinguish support, platform and optional permission state. Permission queries do not prompt. Explicit main-thread requests, fixed settings links, native preflight and frontend preflight gate selected sources before preparation/network/capture. Permission state refreshes on focus. OS credential commands use the existing Apple Keychain integration. Shared ASR, buffering, pause, drain and final-only evidence semantics are unchanged.

The first native plugin handles duplicate activation without interpreting incoming arguments. Independently, `storage::WorkspaceLock` holds an exclusive OS file lock for the process lifetime before database load/save, protecting snapshot writes when another process cannot be activated. Native lock tests and Windows duplicate-launch smoke passed; actual macOS build/runtime acceptance remains open. The `check-macos-bridge` feature type-checks the Rust ABI on Windows only; it does not compile the Objective-C half. See docs/MACOS_AUDIO.md.


## Prevention audit and first-run/setup follow-up (2026-11-11)

Native normal close/quit now checks operation/preparation ownership as well as active session completion, retaining the window through capture and final save. Forced termination remains outside the guard. Capture-frame pause epochs prevent pre-/post-resume audio from sharing a resampler/chunk; a quiet paused queue flushes its pending tail, and a resumed frame enforces a boundary even for fast pause/resume. Deepgram flush positions are a bounded ordered queue and precede later PCM, avoiding an asynchronous Finalize being overtaken by resumed audio.

Capture-driver joins now have a two-second caller budget. Microphone/system worker permits remain held until the OS call actually returns; cancelled late startup cannot play/send into a later session. This bounds repeated blocked starts without pretending to interrupt an OS driver. Local inference/final-transcript draining retains its own cancellation behavior; no universal hard realtime/driver recovery guarantee is introduced. Source review and evidence: docs/UPSTREAM_ISSUES_REVIEW_2026-11-11.md.

The first-run screen is now its own `Welcome` component, returned instead of mounting the interactive workspace underneath. It preserves the Glyph background with increased ink, uses actual Animate UI LiquidButton/Effect primitives, and focuses the new step after the transition. It makes no permission, speech-download, API or recording request. Onboarding completion remains the existing durable setting.

Windows setup is a native WPF window embedding the exact generated NSIS payload. Its real extraction progress, SHA-256 validation and installation/verified-launch stages use the existing Tauri install machinery silently. A payload helper override aborts an open-app install/uninstall instead of force-closing recordings. The wrapper never requests workspace deletion. Mac DMG positions/artwork follow native Finder drag-to-Applications behavior; Mac packaging acceptance is still open. See docs/INSTALLER_EXPERIENCE.md.

## NVIDIA/Voyage knowledge service - 12 November 2026

The assistant builds a typed, scoped evidence corpus in `assistant/retrieval.ts`. `assistant/nvidia.ts` delegates fixed-provider HTTPS requests to native `knowledge/`, with OS keyring credentials, progress events and cancellation. A focused small-meeting route skips retrieval calls; the hybrid route uses Voyage document/query embeddings, local exact cosine + keyword RRF, Voyage reranking and NVIDIA Nemotron 3.5 Super generation. Known citations and fresh canonical revisions gate answer publication. See docs/KNOWLEDGE_ENGINE.md for all bounds and code responsibilities.

Derived embeddings use a separate native rusqlite database, `knowledge-vectors.sqlite3`, with model/input-hash keys, a 20,000-entry cap and no raw passage text. It is disposable, unencrypted derived data. Canonical transcript/notes/documents remain in the existing SQLite WASM snapshot; this is not a completed native canonical-storage migration. Source mutation notifications revoke vectors and cancel pending requests; epoch checks under the cache lock prevent late writes after revocation. Speech capture is independent of retrieval work. Browser mode remains keyless and extractive; it has no cloud knowledge transport.

Answers are session-only, not a durable generation-job ledger. No LangGraph, ANN extension, hosted vector database, arbitrary action tools or server was added. Source text and questions are untrusted. Citation existence/revision validation does not establish factual entailment.

## Reference-driven UI and cache follow-up

Theme and imported-file cloud permission are backward-compatible settings fields. `theme` defaults to light and sets the document's theme/color-scheme; `cloudLibraryConsent` defaults false. The latest requested source experience supersedes per-question checkboxes: same-scope history is automatic, and imported files become automatic only after that Settings permission plus the provider text permissions. Offline search includes selected local files without cloud permission.

`AudioWave.tsx` renders bounded 30 FPS bars, using RMS for capture and an explicitly labelled sample pattern for welcome. Visibility, quiet mode and OS/in-app reduced motion pause work. `AiStatus.tsx` maps native phases to the supplied status concept instead of simulating stages on timers. `ThemeSelector` and `HookSidebar` adapt the supplied visual components without Next.js, Tailwind or external GitHub/favicon requests. The activity model derives local calendar dates from saved non-demo meetings and is independent of retrieval.

Query vectors share the derived SQLite store under a separate model-versioned namespace, bounded to 256 entries. No raw question is persisted. Canonical source revocation does not invalidate an unrelated question vector; workspace/cache clearing removes both. Identical document reimports preserve eligible vectors, while text/location/scope changes still revoke them. The NVIDIA message layout keeps stable system/evidence content before the question; no provider prefix-cache hit is assumed or claimed.


## Finish-time reports and orphan recovery — 16 November 2026

`engine/report.ts` selects the permitted note generator independently of transcription. `App.generateReport` runs after a terminal native snapshot, which includes stop-time speech, and deduplicates concurrent/duplicate completion notifications. It saves the transcript before inference, persists report lifecycle state in the backwards-compatible meeting JSON, fingerprints final real speech, rejects changed evidence and applies generated blocks to the latest canonical meeting. Typed or edited generated notes are never overwritten. Restarted running jobs become retryable failures; no cloud request silently resumes at boot. Offline mode uses labelled excerpts, not an AI summary. This is a bounded finish job, not continuous synthesis or a full durable scheduler.

`notes_generate_nvidia` uses the OS-stored NVIDIA key, an allowlisted model, explicit text consent, a 48,000-character final-only transcript bound, fixed endpoint, bounded response, cancellation and schema/evidence checks. It invokes no retrieval/embedding/file service. `SpeakerDetection` derives per-source anonymous label estimates; reconnect labels are not summed. `recoverOrphanSession` restores native journals missing a canonical entry, with an honest recovered title/date and no invented notes. Normal native deletion removes the journal too.

The separate owner-private website now includes a 45-second PCM WebSocket gateway to Deepgram. Its fixed endpoint requests diarization and model-improvement opt-out; runtime secrets are stored in Sites, not browser code. It has origin checks, time/byte/frame limits, downstream cleanup and per-isolate throttling. This private pilot is not a production public quota gateway; global budgets and public abuse controls remain open. The Worker embeds compressed static assets and serves them with manual content encoding. No demo content is persisted.

## Website app sandbox (17 November 2026)

The marketing frame loads the real React application with `?demo=meeting&showcase=1`. `isShowcase` is restricted to browser execution. Storage RPC initialization passes an explicit ephemeral flag: the worker still uses the normal SQLite schema, migrations, document indexing, note editing and local retrieval, but skips both IndexedDB restoration and exported snapshot writes. Sample meetings/files therefore start fresh and cannot read or replace the visitor's ordinary browser workspace. Closing the frame terminates that worker and discards its in-memory database. Native storage behavior is unchanged.

The frame denies microphone/camera/geolocation access. It labels the sample workspace and reset behavior; the floating conversation roadmap starts collapsed in this mode to leave space for editing. This is a working browser playground, not a claim of native recording or live cloud ASR inside the app frame. The existing separate voice trial still requires an explicit Start action and microphone permission.
