# Native audio and ASR

This is the implemented 2026-11-11 engine, with verification limits below. It supersedes the earlier implementation plan. It is an initial native engine, not a claim of state-of-the-art accuracy or verified hardware integration.

## Desktop path

1. The UI saves a new meeting identity before starting capture. Native commands allow one active/finishing session, fixed source/device choices, and allowlisted models. Recording never resumes automatically.
2. CPAL captures the selected microphone; optional Windows WASAPI loopback captures the default render endpoint. Microphone and computer audio remain separate channels. Either source can be selected independently. Headphones help prevent microphone recapture; acoustic echo cancellation, playback exclusion and speaker recognition are not implemented.
3. Native capture sends float PCM through a bounded 128-frame ingress queue. A sinc resampler normalizes each source to mono 16 kHz and flushes its delayed tail. The clock excludes pauses and freezes at stop.
4. An energy-based gate selects silence endpoints after at least two seconds; twelve seconds forces a chunk. One CPU Whisper worker handles six queued chunks. Silence/very short audio can be skipped. This is not neural VAD, diarization, overlap reconciliation or token streaming. Chunk boundaries can affect recognition.
5. Backpressure stops capture visibly rather than growing memory. The pending chunk is retained for finalization. Stop releases capture, flushes resampling/WAV tails and drains inference. Cancel aborts remaining inference, preserves finalized passages and marks interruption. Capture/retention is capped at four hours.
6. Finalized segments have stable session/source/batch/index IDs, real source labels and session-relative times. Version-1 journals save transcript, state and model/language/source metadata atomically, with five-second checkpoints. Raw audio is never embedded in SQLite.
7. On reopen, the latest 100 valid journals merge by stable segment ID into existing meetings. Live/paused/starting/finalizing journals become interrupted. Edited notes remain intact, and recording does not restart. The SQLite snapshot architecture still has its existing 50 MB ceiling; large-library storage needs a future native incremental-SQLite migration.

Source files: `src-tauri/src/engine/{capture,dsp,asr,runtime,models,types,notes}.rs`, `src/engine/{client,notes}.ts`. `SpeechBackend` is the native runtime boundary for future ASR alternatives. The browser's `AsrBackend` remains explicitly unconfigured. See DESKTOP_PACKAGING.md for the included-model release path.

## Models and setup

Use **Record meeting** and **Start recording**. Local transcription is on by default, and speech preparation is automatic before capture. Standard packages include Base; missing or selected alternate models are fetched automatically. Settings contains optional advanced controls, not mandatory setup. Base is the lighter starting choice; Small requires more CPU/RAM. The language preference selects English or French, without translation.

| ID | Artifact size | SHA-256 |
|---|---:|---|
| whisper-base | 147,951,465 bytes | `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe` |
| whisper-small | 487,601,967 bytes | `1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b` |

Fixed upstream: [ggerganov/whisper.cpp model repository](https://huggingface.co/ggerganov/whisper.cpp/tree/5359861c739e955e79d9a303bcbc70fb988958b1), revision `5359861c739e955e79d9a303bcbc70fb988958b1`; `ggml-base.bin` / `ggml-small.bin`, multilingual rather than `.en`. Included resources are preferred and atomically copied after verification. Missing-model partial downloads can resume. Bytes and SHA-256 are verified before promotion and before transcription starts. A corrupt download is discarded. **Verify / repair** checks an installed artifact and fetches a replacement if needed. Cancellation can wait for the bounded network read timeout. Only model weights are fetched; no executable is downloaded or run.

Paths under fixed Tauri app data:

- `engine/models/<allowlisted-id>.bin` (plus partial downloads).
- `engine/sessions/<UUID>/session.json` for recovery.
- `microphone.wav` / `system.wav` only if native retention was explicitly enabled.

Native retained WAV files are not yet playable/exportable through the app UI. Meeting deletion removes matching journals/audio; delete-all clears session history. Reusable models remain cached. Imported audio files are still playback-only. Browser microphone capture remains MediaRecorder with its existing 100 MB limit and optional explicit download offering; it does not invoke ASR.

## Note drafts

**Draft notes from transcript** offers source excerpts selected across the conversation. This deterministic option works without a language model and makes no generated-summary or inferred-decision claim. Draft items show their exact transcript evidence before application; applied sources remain clickable.

Optional generation uses an already installed local GGUF model in Ollama. Choose it through **Settings → AI provider → Local note drafts**. Buddy uses fixed loopback `/api/tags`, `/api/show` and `/api/chat` endpoints, no proxy/redirects, no tools, and no model pulling. Known remote/cloud models are rejected. See [Ollama's structured-output API](https://docs.ollama.com/capabilities/structured-outputs). Local model drafting is blocked while recording/finishing, and a draft reserves the engine so recording cannot compete with it. Requests are explicit, serial, cancellable and bounded to 48,000 transcript characters, 2,000 segments and a 128 KB response. The request times out after 180 seconds.

Both Rust and TypeScript validate returned IDs against finalized evidence. Text is escaped before editor insertion; decisions/actions are marked **Needs verification**, without fabricated confidence, owners or deadlines. Reviewed drafts get their own generated section. Personal notes and an edited generated section are protected. ID validation cannot prove that a model's claim follows from its sources. Long-meeting hierarchical generation, automated incremental synthesis and generative assistant answers through Ollama are not implemented.

## Build and reproducible inference smoke test

Rust 1.90+, CMake, native C/C++ tools and libclang are required in addition to the existing Tauri prerequisites. Use `scripts/native-env.ps1` (or `scripts/desktop.ps1`), which selects a complete installed Windows MSVC toolset and sets only process-local paths. Install LLVM/libclang normally on another machine and set `LIBCLANG_PATH` to its library directory. This workspace also has an ignored, checksum-verified libclang 18.1.1 DLL at `.toolchain/libclang`; it is a development dependency, not a shipped DLL. No global tools/PATH were changed.

Do **not** use `WHISPER_DONT_GENERATE_BINDINGS` on Windows: the supplied bindings have Linux layout assertions. `.cargo/config.toml` selects a baseline CPU build without host-specific AVX instructions. This favors compatibility over peak throughput. GPU acceleration is not enabled.

`whisper-rs` 0.16.0's safe abort-wrapper pointer handling failed the first real inference probe. Buddy uses the raw callback with a stable `Arc<AtomicBool>` allocation held for the complete call, with a documented safety invariant. Actual speech/silence/cancellation testing verifies this integration; compilation alone did not catch it.

```powershell
. ./scripts/native-env.ps1
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --lib
# The ignored inference test requires explicitly provided, checksum-verified fixtures:
$env:BUDDY_ASR_MODEL = '<absolute path to pinned whisper-base.bin>'
$env:BUDDY_ASR_WAV = '<absolute path to public mono 16 kHz JFK WAV>'
$env:BUDDY_ASR_RESULT = '<absolute output JSON path>'
cargo test --manifest-path src-tauri/Cargo.toml actual_whisper_fixture -- --ignored --nocapture
```

Test fixture: [whisper.cpp v1.7.6 public JFK WAV](https://github.com/ggml-org/whisper.cpp/blob/v1.7.6/samples/jfk.wav). Development downloads, provenance and inference output are ignored under `output/engine-probe/`, not installed into user app data.

## Verified and still required

Executed: packaged Windows startup and read-only engine IPC (no stream opened), Windows cargo check/release build, actual pinned model download/resume/verification; synthetic resampling/duration/alias-rejection tests; clock, startup-failure, journal/recovery, corrupt-file and queue tests; actual Base inference on the public 11-second English WAV; silence and callback cancellation; UI transport simulations at desktop/phone widths; browser regressions. See TESTING.md for exact final counts.

Not established: physical microphone or loopback capture, simultaneous devices, feedback/echo behavior, permission revocation, unplug/replug, device switching, sleep/resume, long-session CPU/RAM, real meeting/French accuracy, Small-model inference, actual Ollama generation, native WAV playback/export, or macOS compilation/runtime. Driver disconnects stop explicitly; transparent hot-plug recovery is not implemented. No Mac was available. macOS system audio still needs ScreenCaptureKit integration and separate permission/OS-version tests. A passed fixture, fake-device Chrome run, native compilation or CI configuration does not establish any of these.


## macOS integration follow-up — 2026-11-11

The earlier Windows-only system-audio limitation is replaced in source by a macOS 13+ ScreenCaptureKit bridge, explicit permission checks/UI, own-app/process exclusion, bounded native startup and callback-safe teardown. It feeds the shared source-separated local/Groq/Deepgram pipeline. Capture is gated until every selected source is ready, preventing startup backlog. Apple SDK compilation and physical Mac capture remain unverified; see [Mac implementation and acceptance](MACOS_AUDIO.md).
