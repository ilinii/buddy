# Buddy

An open-source meeting workspace for recording conversations, keeping personal notes and finding answers in saved context. Licensed under **AGPL-3.0-only**.

**Early access:** Windows is the primary development target. macOS and iPhone source targets exist; Apple SDK builds, signing and physical-device acceptance remain open. A successful build or simulated audio test is not hardware verification.

## Start locally

Requires Node.js 24+.

```sh
npm ci
npm run dev
```

Open http://localhost:1420. No account or API key is required for the browser workspace, sample replay, personal notes and local source search. Browser microphone recording is audio-only; it never invents a transcript.

## What Buddy does

- Records microphone audio and, in supported desktop builds, selected computer audio.
- Supports on-device Whisper, Deepgram Nova-3 live captions, and Groq Whisper transcription through your own provider credentials.
- Keeps editable personal notes separate from generated drafts and timestamped transcript evidence.
- Prepares a finish-time report with consented NVIDIA or a configured local model; offline mode saves labelled excerpts.
- Shows anonymous Deepgram speaker estimates, not guaranteed headcounts or named-person identification.
- Searches saved meetings and selected documents, with optional NVIDIA/Voyage evidence-grounded answers and local vector caching.
- Supports light/dark themes, keyboard navigation and reduced motion.

Native API keys belong in the OS credential store, configured from Settings. **No project key, recording, personal workspace, trained model or paid service is included.** Cloud speech, cloud text and cloud document processing have separate permissions.

## Desktop and iPhone

Desktop builds need Rust 1.90+, the platform's native build tools, CMake and libclang. See [build instructions](docs/BUILD.md), [architecture](ARCHITECTURE.md), [knowledge engine](docs/KNOWLEDGE_ENGINE.md) and [testing limits](TESTING.md).

```sh
npm run desktop
npm run desktop:package
```

Packaging downloads and verifies the pinned Whisper Base model (about 148 MB); the weights are not committed. Ordinary source development does not require a bundled model. iPhone commands run on a Mac with Xcode: `npm run ios:setup`, then `npm run ios`.

## Website

The marketing source and optional Deepgram demo gateway are in [website/buddy-site](website/buddy-site/README.md). `npm run website:build` prepares static files for GitHub Pages. GitHub Pages cannot run the speech gateway or protect API secrets; a separate server is required for live website transcription. See [domain and hosting](docs/HOSTING.md).

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and [PRIVACY.md](PRIVACY.md). Do not upload recordings, private files, credentials, local databases, debug profiles or model weights. Use fictional fixtures in tests.

## License

Buddy's original source is [GNU AGPL version 3 only](LICENSE). Third-party dependencies and bundled font notices retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The Buddy name and Keepsake identity are not a grant of trademark rights.
