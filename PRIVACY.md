# Privacy and data flow

Buddy keeps meeting notes, transcript evidence and selected document excerpts on the current device. Audio is separate from SQLite; retention is optional. Workspaces do not currently sync. Local storage is not application-level encrypted and may be included in device backups.

Cloud processing is optional and separately permissioned. Deepgram/Groq receive authorized audio. NVIDIA/Gemini receive scoped meeting text for permitted AI features. Voyage receives permitted text for embedding/reranking; importing a file does not itself authorize cloud processing. Native credentials stay in the OS credential store.

Deepgram speech requests explicitly set `mip_opt_out=true`. This is not a blanket promise about every provider's training or retention. Voyage's account opt-out and NVIDIA/Gemini service terms require separate review. Cancelling cannot retract data already sent. Buddy does not train its own models on meeting content.

The optional website demo streams a bounded microphone sample through a server gateway to Deepgram. Its provider key is server-only; the example does not persist or log audio/transcript contents. Request metadata and in-memory rate-limit buckets can still be processed. HTTPS/WSS transport encryption is not end-to-end encryption.

Deleting a source revokes Buddy's local derived evidence, not copies already held by a cloud provider or device backup. Inform participants and comply with applicable recording rules. This document describes implementation boundaries, not a legal/compliance certification.
