# Security release review

Prepared locally on 2026-10-05 and subsequently released by the user through
staging and production. The user configured provider keys privately and ran
server commands; the agent's deployed checks used public endpoints only. No
credential values or customer records are included in this report.

## What to review

- Startup rejects unsafe origins, invalid rate/proxy settings, incomplete
  CAPTCHA configuration, missing production hostname binding, and published
  Cloudflare dummy keys in production mode.
- Signup verification checks Cloudflare HTTP/result validity, action, and
  hostname. Provider errors and timeouts deny signup without logging secrets.
- Error logs use fixed event names and safe error codes; malformed/oversized
  JSON gets an appropriate client error without logging its contents.
- The configuration helper prompts privately, preserves database credentials,
  keeps an original private rollback copy, and writes runtime settings atomically.
- Production `www` redirects to the apex. The deployment script recreates Caddy
  to load changed file mounts; this briefly interrupts proxy connections.
- CI adds production-mode security tests. A separate weekly/manual workflow
  scans production dependencies and API/PostgreSQL/Caddy images.
- Credential rotation and incident procedures are documented in
  [operations.md](operations.md).

## Initial local verification

- Node 24 syntax/migration checks and seven security unit tests passed.
- Ten Python configuration-helper tests passed, including private review/apply,
  refusal of echoed secret input, rollback, credential preservation, and failure
  cleanup.
- Eleven production-mode API security cases passed against a generated isolated
  database and restricted login. Cases cover cookies, signup verification,
  cross-account writes, origin checks, and rate limits across API restart.
- Twelve PostgreSQL migration/role cases and the existing API integration test
  passed. The gameplay simulation completed 1,000 rounds.
- Production dependency audit reported zero vulnerabilities.
- The API image built successfully, runs without root, contains the verification
  script, and excludes private environment files and Git metadata.
- Caddy configuration validation and GitHub Actions validation passed.
- Staging's current public HTTPS/header/CORS/blocked-write checks passed with the
  explicit option allowing its currently unconfigured Turnstile widget.

The weekly container scan workflow was validated and later merged into main.
No container scan findings were reviewed in this session. These results do not
establish that deployed images are vulnerability-free.

## Deployed acceptance, 2026-10-05

- Security implementation `66ce8ee` reached dev through PR #33 (`5045b9f`) and
  main through PR #34 (`991fe6f`). The user reported both deployment jobs green.
- Separate real Turnstile widgets and 1Password API Credential entries were
  created for staging and production. The private helper's apply/check succeeded
  on each server; it saved rollback settings and preserved database credentials.
- The user recreated the APIs and production Caddy. Health and deployed security
  endpoint checks passed; the production www check passed using the corrected
  verifier described below.
- The user confirmed real signup with successful Turnstile, login persisting
  after refresh, Secure/HttpOnly cookie flags, SameSite=Lax, Path=/, gameplay,
  logout, and statistics retained after signing back in on both environments.
- A bounded staging check using only public configuration GETs reached HTTP 429
  on request 121 with a positive Retry-After. Authentication-specific limits and
  restart persistence were tested on isolated databases, not live accounts.
- Google remains disabled. Weekly scans are configured on the default branch;
  their findings still need review.

## Remaining release and recovery work

1. Review and release the verifier correction below through dev, then main,
   and rerun the verifier included in each deployed image.
2. Refresh private offsite recovery configuration copies; older copies predate
   the Turnstile settings and must be retained as historical rollback material.
3. Review the first weekly/manual container scan results and address findings.

Follow [README.md](README.md) for the exact settings and commands.

## Production verification follow-up, 2026-10-05

The initial deployed verifier passed the main site's checks but encountered a
TLS error on the final www request after Caddy restarted. A subsequent public
request completed successfully and returned the configured 301 apex redirect.
The checker also incorrectly required 308: Caddy's `permanent` keyword uses 301.
The corrected checker accepts either permanent status, still requires the exact
destination including path/query, and passed all production checks under Node 24.
This correction is prepared separately for review; the deployed image still
contains the original checker until the correction is released. The user has
since confirmed the production browser acceptance checks listed above.
