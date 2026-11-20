# Issue #7: report generation during meeting deletion

Individual deletion now revokes report-job ownership and aborts the provider before native cleanup or the SQLite delete queue. The UI rejects writes while deletion is pending. Both successful and failed late callbacks verify ownership, including conditional job cleanup, so an old job cannot recreate the meeting or interfere with a replacement retry. If deletion fails, saved personal notes remain and the cancelled report becomes retryable.

Verified on Windows with Chrome on 20 November 2026: TypeScript checking, 64 unit tests, production build, and 18 Playwright workflows in report-deletion.spec.ts, report.spec.ts and animate-controls.spec.ts passed. The build retains the existing bundle-size advisory. The new tests use real SQLite with simulated native IPC and hold the delete acknowledgement until after a late provider response or rejection. Failed native cleanup and report retry are also covered. Existing report workflows include 1180 and 390 px widths.

No Rust implementation changed. These checks do not verify physical recording, real cloud requests, or clean Windows packaged installation. Hosted platform/build checks are attached to the PR.
