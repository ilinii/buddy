# Public website on GitHub Pages

The public website lives at https://meetbuddy.me, served from the `main` branch root of `ilinii/ilinii.github.io`. Application source remains in `ilinii/buddy`.

Build with `npm ci` and `npm run website:build`. Copy only generated `output/website-pages` files into the Pages checkout, preserving its `CNAME` (`meetbuddy.me`) and `.nojekyll`. Include the AGPL license and a source link. Review and scan the deployment before pushing; never copy development output, credentials, recordings, databases or private hosting manifests. Remove obsolete generated assets before updating.

The static build omits the cloud voice trial and its scripts, adjusts the privacy notice for GitHub hosting, and includes the local browser workspace under `/app/`. It does not install the native application or expose any cloud key. A shared-credit public voice gateway requires separate hosting and production usage budgets/abuse controls.

16 November 2026 verification before publication: TypeScript, 62 unit tests, app/static builds, publication guard and Gitleaks directory scan passed. Browser checks at 1440, 390 and 320 px passed: ASCII render, no horizontal overflow, workflow/setup controls, mobile navigation, accurate privacy page, working note editor and no console/network failures. Browser capture is not physical-device/native transcription acceptance.

GitHub Pages HTTPS is a separate setting. Verify certificate issuance and an actual HTTPS response before enabling HTTPS enforcement. Certificate provisioning can be restarted by removing and restoring the same custom domain if it becomes stuck; retain the domain in source. Never bypass browser certificate warnings as a deployment check.

Publication outcome: GitHub Pages deployed successfully. `https://meetbuddy.me/` validates its certificate and returns HTTP 200 with the Buddy landing page. HTTPS enforcement is enabled and HTTP redirects to HTTPS. Certificate expires 14 February 2027. The `www` alias still needs its Namecheap CNAME changed from `meetbuddy.me` to `ilinii.github.io` before GitHub can provision its additional certificate; do not claim HTTPS for that alias yet.

The same browser smoke checks also passed against the live HTTPS origin at 1440/390/320 px, including the browser note editor and no console/network errors.
