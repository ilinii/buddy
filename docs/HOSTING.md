# Domain and website hosting

GitHub Pages serves static HTML/CSS/JavaScript. It cannot run the speech gateway, keep an API key secret or proxy a live transcription WebSocket.

For a static website, run `npm ci`, then `npm run website:build`. Publish `output/website-pages` using your chosen Pages repository. Keep your existing custom-domain association in that repository; do not associate the same domain with two competing Pages sites. Enable HTTPS only after GitHub issues a valid certificate. Verify the domain under GitHub account settings to protect against takeover.

For an apex domain, GitHub documents A records for 185.199.108.153, 185.199.109.153, 185.199.110.153 and 185.199.111.153. Configure a www CNAME and custom-domain settings as described at https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site . Do not add wildcard DNS entries.

The domain owner's existing Pages repository and HTTPS settings are configured outside this source release. Publishing source code here does not change DNS or deploy over an existing website.

Live voice needs the optional Worker gateway and your own server-side Deepgram secret. The source contains no operational key or private hosting identity. The example is a bounded pilot; add durable global/per-user quotas and abuse protection before exposing a shared-credit gateway publicly. Never paste a provider key into the static Pages build.
