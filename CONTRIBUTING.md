# Contributing

Use Node 24 and open a small pull request describing the problem, behavior change and executed checks. Contributions to Buddy are accepted under AGPL-3.0-only. Keep upstream copyright/license notices for dependencies; do not copy components with additional redistribution restrictions.

Run `npm run check`, `npm test`, `npm run build` and relevant Playwright workflows. On a clean non-Windows development machine install Chromium with `npx playwright install chromium` and set `BUDDY_PLAYWRIGHT_BUNDLED=1` for browser tests.

Do not send real conversations or private files in bug reports. Use fictional excerpts, redacted metadata and explicit sample labels. Never add API keys, environment files, model weights, audio, databases, browser profiles, signing identities or build output. Live provider fixtures are opt-in, use your own credentials, and must stay separate from the ordinary test suite.
