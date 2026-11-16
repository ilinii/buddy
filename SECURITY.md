# Security

Do not publish credentials, recordings, transcripts or private documents in issues. Use this repository's private vulnerability-reporting channel when available: https://github.com/ilinii/buddy/security/advisories/new . For ordinary issues, include only redacted errors and fictional reproduction data.

Native provider keys use the OS credential store; browser settings must not store them. Hosted gateway secrets belong in the hosting platform's secret store. Never put a provider key in public JavaScript, GitHub Pages files, CNAME, build arguments or committed `.env` files.

Before committing, inspect `git diff --cached`, run `npm run security:check`, and run Gitleaks locally when available. GitHub push protection and the secret-scanning workflow are additional checks, not a guarantee. A credential that was ever exposed must be rotated; deleting it from the latest file is insufficient.

This early-access code has not had an independent security audit. Public cloud gateways require authenticated quotas, durable usage budgets, abuse controls and provider/privacy review. The example speech gateway's in-memory throttle is not a global budget.
