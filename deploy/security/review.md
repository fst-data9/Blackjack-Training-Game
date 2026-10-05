# Security release review

Prepared locally on 2026-10-05. No production deployment, credential rotation,
provider-account change, or customer-data change was performed.

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

## Verification

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

The weekly container scan workflow has been validated but has not run on GitHub.
These results do not establish that deployed images are vulnerability-free.

## Remaining before acceptance

1. Review and release the code through staging, then production.
2. Create separate real Turnstile widgets in your Cloudflare account; apply each
   environment's keys privately using the helper. It enables required CAPTCHA.
3. Run the deployed HTTPS verification script, then confirm real browser signup,
   login, gameplay/statistics, logout, and secure cookie acceptance.
4. Refresh private recovery configuration copies. Weekly schedules become active
   once their workflow is on the GitHub default branch.

Google remains disabled unless explicitly configured. Provider-console setup and
real browser acceptance remain unchecked in the deployment checklist. Follow
[README.md](README.md) for the exact settings and commands.
