# Public website on GitHub Pages

The public website lives at https://meetbuddy.me, served from the `main` branch root of `ilinii/ilinii.github.io`. Application source remains in `ilinii/buddy`.

Build with `npm ci` and `npm run website:build`. Copy only generated `output/website-pages` files into the Pages checkout, preserving its `CNAME` (`meetbuddy.me`) and `.nojekyll`. Include the AGPL license and a source link. Review and scan the deployment before pushing; never copy development output, credentials, recordings, databases or private hosting manifests. Remove obsolete generated assets before updating.

The static build omits the cloud voice trial and its scripts, adjusts the privacy notice for GitHub hosting, and includes the local browser workspace under `/app/`. It does not install the native application or expose any cloud key. A shared-credit public voice gateway requires separate hosting and production usage budgets/abuse controls.

16 November 2026 verification before publication: TypeScript, 62 unit tests, app/static builds, publication guard and Gitleaks directory scan passed. Browser checks at 1440, 390 and 320 px passed: ASCII render, no horizontal overflow, workflow/setup controls, mobile navigation, accurate privacy page, working note editor and no console/network failures. Browser capture is not physical-device/native transcription acceptance.

GitHub Pages HTTPS is a separate setting. Verify certificate issuance and an actual HTTPS response before enabling HTTPS enforcement. Keep the canonical domain stable while an existing certificate request is pending; do not repeatedly remove/re-add it. Never bypass browser certificate warnings as a deployment check.

17 November 2026 recheck: the apex certificate validates normally and expires 14 February 2027. The `www` CNAME is now correctly `ilinii.github.io`; all apex A records are GitHub Pages addresses. Fresh GitHub health checks accept both DNS configurations and find no CAA error. However, the certificate request for both names is still `new`: HTTPS `www` fails hostname verification, and the API rejects `https_enforced=true` because the certificate has not been issued. Enforcement is currently **false**. The page-level HTTP upgrade is a safeguard, not a substitute for a valid www certificate or server-side enforcement. No TLS warning was bypassed.

The same browser smoke checks also passed against the live HTTPS origin at 1440/390/320 px, including the browser note editor and no console/network errors.

The public voice demo uses an optional bounded external gateway. Set BUDDY_VOICE_GATEWAY to its HTTPS origin before website:build; the build keeps the microphone trial and accurate quota/privacy notice. Without that variable it still emits the static-only version. See PUBLIC_VOICE_DEMO.md and website/voice-demo/README.md.


## Download page and logo (17 November 2026)

`/download/` is the marketing download destination. Windows, macOS, iOS and Android all display **Coming soon**, as requested; there are no active native-download buttons or invented release dates. The existing developer preview release remains on GitHub. Home/header/mobile download links lead to this page. The page includes an illustrative meeting waveform, a reduced-motion/pause control, and links to the browser voice trial and workspace. In a static-only export the trial links are replaced with the browser workspace.

The approved transparent Keepsake PNG is embedded directly in the public page HTML, preserving its silhouette and avoiding a separate logo fetch. The previous apex image endpoint returned a valid PNG during investigation; its HTTP response alone did not explain the user's rendering failure. Tests verify decoded logos even when the old asset URL is blocked.

Local verification: TypeScript, 62 unit tests and production/static builds passed. Both website workflows passed at 1440/1024/820/768/390/320 px: navigation, availability labels, logo decoding, GitHub count, menu/focus, motion controls, source questions, no overflow or page/network errors. No live transcription credits were consumed by these checks. Desktop and phone screenshots were inspected. This is website verification, not native platform acceptance.
