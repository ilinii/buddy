# Buddy knowledge engine — implementation and learning guide

Implemented 12 November 2026. This is a working desktop cloud-assisted RAG path, with local canonical data and an offline excerpt mode. It is not a claim of market-leading answer accuracy, an offline generative model, or a completed multi-user SaaS.

## Try it

1. Open **Settings → AI provider → Provider → NVIDIA + Voyage**.
2. Check the saved-key indicators, choose **Nemotron 3.5 Super**, and separately allow selected text to NVIDIA and Voyage. Credentials are saved in the OS store, not the database or frontend bundle. The supplied keys were saved on this Windows account; a Mac or another OS account needs its own key setup.
3. Open a real meeting, add notes or finalized speech, then ask Buddy a question. Saved meeting history is searched automatically; demo and real libraries remain separate.
4. Add files in Knowledge. Importing is local and never triggers a cloud indexing job. To use their contents in cloud answers, explicitly enable **Use imported files in cloud answers** once in Settings. It defaults off; after enabling it, questions automatically retrieve from imported files as well as saved meetings.
5. Read the linked transcript, note revision or document excerpt. Model prose still needs review; valid citations do not prove every claim follows from its source.

The app's default remains offline with cloud consent off. Saving a credential does not grant consent to upload the existing workspace. No account, billing, model download or paid tier was provisioned for this integration.

## What the models do

| Component | Selected implementation | Job |
|---|---|---|
| Speech recognition | Existing local Whisper / separately selected Deepgram / Groq | Audio → timestamped finalized transcript. Independent of this feature. |
| Embeddings | Voyage `voyage-4-large`, 1,024-dimensional float vectors | Represent scoped passages and a question for semantic similarity. Uses separate `document` and `query` input types. |
| Keyword retrieval | Local prefix-aware BM25-style scoring with evidence-intent boosts | Find names, numbers, topics and supported decisions/actions. This shared corpus ranking is separate from the existing document FTS5 index. |
| Dense retrieval | Exact cosine similarity over the scoped cached vectors | Find semantically related passages even when wording differs. No ANN extension or external vector database is installed. |
| Rank fusion | Reciprocal Rank Fusion, constant 60 | Combine keyword and semantic candidate rankings without comparing incompatible raw scores. Each contributes up to 60 candidates; the merged pool is bounded to 32. |
| Reranking | Voyage `rerank-3` | Jointly compare the question with candidate passages and reorder the strongest evidence. Returns up to 12. |
| Generation | NVIDIA-hosted `nvidia/nemotron-3.5-super-vl-120b-a12b`, thinking disabled | Write a concise answer using the selected evidence. This integration sends text only, despite the model's vision capability. |
| Verification | Typed source IDs, bounded schemas, citation parser and fresh source-revision checks | Reject unknown references, incomplete output and revoked/changed evidence before publishing. Not a factual-entailment verifier. |

DeepSeek V4.1 Flash remains an explicit optional selection. It appeared in the authenticated model catalog but the tiny inference probe timed out. Kimi K2.6 and Nemotron 3 Super returned account/endpoint access errors and were not chosen as defaults. Nemotron 3.5 Super completed the live fixture. A model catalog entry is not proof of working account access. There is no silent switch to another provider after a failure.

## Follow one question through the code

### 1. Scope and evidence

`src/ui/Assistant.tsx` takes a fresh canonical snapshot and applies automatic same-scope meeting retrieval and the saved file-cloud permission. `src/assistant/retrieval.ts` constructs one typed evidence corpus across final speech, saved note blocks and imported text. Partial captions are never evidence. Manual and microphone meetings can share a real history; both exclude demos. Demo requests exclude real meetings and real files.

Passages are at most 1,800 characters with 120-character overlap. Paragraph/sentence boundaries are preferred; a long line is still split without silently losing its tail. This is bounded character chunking, not a token-aware semantic chunker. Each passage carries its original root ID, source ID, content revision/hash, title, location and citation. Document page/paragraph/cell/line locations are preserved. Notes have a block ID and revision; transcripts have segment IDs and timestamps.

### 2. Choose the route

`src/assistant/nvidia.ts` subscribes to real native progress events, prepares a unique request ID and calls the native service. `src-tauri/src/knowledge/mod.rs` chooses:

- **Focused context:** a current meeting with no requested file/history expansion, at most 20 passages and 24 KB of passage text. It sends the complete bounded context to NVIDIA and avoids unnecessary embedding/reranking calls. Summarizing a short meeting does not need a vector search first.
- **Hybrid retrieval:** a larger context, history or explicitly included files, with Voyage consent. Cache → missing document embeddings → question embedding → cosine + keyword RRF → rerank → evidence selection → NVIDIA.
- **Keyword retrieval:** when hybrid retrieval is needed but Voyage consent is off. This limitation is shown beside the answer. NVIDIA consent and its key are still required for generated prose. A Voyage error does not silently downgrade the requested hybrid route.

The final context normally selects eight strong passages plus at most two adjacent transcript passages, capped at 24 KB of text. The focused route uses up to 20. This is retrieval-augmented generation: **R** retrieves evidence, **A** places it in a bounded prompt, and **G** produces the answer. RAG uses an LLM; it does not replace one.

### 3. Cache and rate limits

`src-tauri/src/knowledge/cache.rs` keeps a separate derived SQLite database at the fixed app-data path `knowledge-vectors.sqlite3`. It stores vector blobs, source/root IDs, input hashes and model identities, not raw passage text or API keys. Input hashes include title/location/text so changed metadata cannot reuse a mismatched vector. Cache keys distinguish embedding configuration and dimensions. The cache is bounded to 20,000 entries and can be cleared in Settings.

Missing document vectors are embedded in batches of 12. Query embeddings are now cached under their own model-versioned namespace (256 entries, hash/vector only). A repeated question can skip every embedding call; new questions still need one query embedding. Rerank results are not cached, so warm requests still call reranking and generation. Identical file reimports preserve unchanged vectors. This is not unlimited free inference.

`src-tauri/src/knowledge/http.rs` serializes provider calls, handles 429/5xx with up to three attempts, uses numeric Retry-After when available with bounded 1–90 second waits, and reports waiting in the UI. It keeps a cooldown after explicit exhausted request-bucket headers or exhausted retries. Account quotas vary; no unverified numeric quota is hard-coded. Cancellation interrupts quota waits, network requests and response reads. Connection failures are surfaced instead of indefinitely retried. Responses are capped while reading, redirects are disabled, and provider error bodies/credentials are not exposed.

Requests and responses are deliberately bounded. A selected corpus is limited to 3,000 passages / 3 million characters, with an additional native byte limit. Bigger selections fail explicitly rather than appearing to search only an invisible subset. Existing file extraction limits still apply.

### 4. Generate and validate

NVIDIA receives a system instruction and a JSON evidence bundle labelled `S1`, `S2`, etc. Source text and the question are untrusted data. The model receives no shell, URL-fetch, filesystem or other action tools. Endpoints and answer models are allowlisted in native code. A non-completed model response is discarded. Unknown/malformed source markers fail validation; uncited proposed answers are not published as supported facts. Valid source markers are mapped to clickable UI references and renumbered to match the displayed source list.

After the native response, the TypeScript provider re-reads canonical storage and checks every selected source, including those used as context but not cited in the answer. Edited notes, changed final speech/timestamps/speaker labels, renamed or reclassified sources, removed files and reimports discard the answer. Adding a later final speech segment does not invalidate an already-selected unchanged passage. Gemini now shares the scoped corpus and fresh-evidence guard; offline mode quotes passages without calling an LLM.

These controls prevent several mechanical failures. They do not establish semantic faithfulness, defeat every prompt injection, infer a confidence percentage or replace human source review. Answers are published after completion and validation; model tokens are not streamed into the UI. Existing live speech captions remain a separate real-time feature.

### 5. Revoke sources

`src/storage/storage.worker.ts` reports affected roots after canonical source mutations. `src/storage/service.ts` persists the snapshot then invokes native invalidation. Meeting deletion, source replacement/removal, edits to existing finalized speech and note revisions revoke vectors and cancel pending knowledge requests. Appended finalized speech can be indexed on the next question. Index/workspace clearing clears derived vectors; workspace deletion also removes the NVIDIA/Voyage credentials.

Native cache writes check the revocation epoch under the cache lock, preventing a late embedding response from recreating deleted entries. Very early cancellation IDs are kept in a bounded queue so an IPC registration race cannot restart a cancelled request. Cancelled indexing retains only already-authorized completed batches; no transcript or note is overwritten by generation.

## Why no LangGraph or a hosted vector database?

This is a small, typed sequential workflow with strict source scope, cancellation and one active request. Explicit TypeScript/Rust services keep it inspectable and avoid another runtime or server. LangGraph would become useful for durable branching/resumable jobs; it is not a replacement for retrieval. Exact cosine search is appropriate for this bounded library. An ANN database, native incremental canonical storage and background job ledger become relevant when scale and measured latency require them.

The earlier pinned AnythingLLM/RAGFlow review informed bounded candidate selection, explicit source filtering and revocation/job-race handling. No upstream application was run and no upstream implementation was copied. See [the source review](KNOWLEDGE_ENGINE_PLAN.md) for pinned revisions and the wider plan.

## Executed evidence and limits

- Live Windows packaged-app native commands read both OS-stored keys. On a three-passage synthetic fixture, cold hybrid retrieval embedded three passages; the warm request embedded zero and reused all three cached vectors. Voyage embeddings/reranking and NVIDIA generation completed, with valid citations and the correct unapproved-date distinction. The cold fixture took about 1.8 seconds; this is not a real-library benchmark or latency guarantee.
- The same native run verified focused-context routing, missing-consent rejection and early cancellation, then removed its synthetic vector roots. The packaged WebView also extracted the public PDF (1 passage), DOCX (2) and XLSX (8) fixtures through its production worker assets without saving or uploading them. No real meeting, private file or physical microphone was used. Reproduce explicitly with `$env:BUDDY_LIVE_KNOWLEDGE='1'; node scripts/knowledge-native-smoke.cjs` on Windows after packaging, with Buddy closed and native keys saved.
- The final 53 TypeScript and 49 native unit/integration checks passed (4 unrelated opt-in fixture tests stayed ignored); a full 80-workflow browser regression passed, followed by 8 relevant workflows on the final extraction implementation. Unit, real local HTTP and browser transport tests cover retrieval scopes, long text, stale sources, cache versioning/revocation, fabricated citations, 429 retry, redacted authentication failures and cancellation. Browser IPC mocks do not certify cloud APIs or hardware. Complete current results are in TESTING.md.
- Fixed the pre-existing PDF import failure: PDF.js helper readiness packets were being mistaken for extraction results. The first nested-worker correction passed Chrome but stalled in the packaged WebView. The final implementation loads the PDF handler inside the existing disposable extraction worker and uses PDF.js loopback transport, with a tagged result protocol that ignores helper packets. The library calls this a fake worker; it still parses the actual PDF inside an isolated worker, not on the UI thread. Browser workflows and the packaged WebView both extracted the public PDF/DOCX/XLSX fixtures with source locations. The outer 30-second timeout terminates the extraction worker; normal completion destroys the PDF task.
- Cross-platform native source uses OS keyring backends and fixed app-data paths. Windows builds/runs were verified. The Windows `check-macos-bridge` check is not an Apple SDK build, Keychain acceptance or Mac hardware test.

## Still open

The canonical workspace still uses the existing 50 MB snapshot design. Separating derived vectors avoids growing that snapshot, but does not complete a native incremental-storage migration. There is no OCR, durable multi-turn answer history, model-token streaming, corpus-wide exhaustive aggregation, calibrated factuality scorer, team authorization, sync, hosted secret proxy, production service guarantee or comprehensive real-meeting quality evaluation in this milestone. Questions are independently grounded; assistant conversations are session-only. Note drafting still has the existing reviewed excerpt/Ollama path; answers do not silently rewrite meeting notes.

Do not ship a shared provider secret inside a public installer. This development build uses each machine's credentials. A SaaS launch needs a backend gateway, user/tenant authorization, per-user usage budgets, applicable provider production terms and a privacy review. Provider free credits/quotas can expire; the app does not promise permanently free cloud operation or enable billing.

## Primary references

- [Voyage embedding request contract](https://docs.voyageai.com/reference/embeddings-api), [rerank models](https://docs.voyageai.com/docs/reranker), [rate limits](https://docs.voyageai.com/docs/rate-limits).
- [NVIDIA Nemotron 3.5 Super model](https://build.nvidia.com/nvidia/nemotron-3.5-super-vl-120b-a12b), [NVIDIA reasoning controls](https://docs.nvidia.com/nim/large-language-models/2.0.13/get-started/advanced/get-started-nemotron-3.5-super-vl.html).
- [Pinned OSS review and wider implementation plan](KNOWLEDGE_ENGINE_PLAN.md).
