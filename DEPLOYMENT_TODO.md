# Deployment Readiness TODO

This checklist tracks the work required to move the Blackjack Training Game from local development to staging and then to a public production deployment.

## Immediate deployment blockers

- [x] Upgrade the API container from the end-of-life Node.js 20 image to a supported Node.js 24 LTS image.
- [x] Choose the hosting platform and deployed domains (`staging.blackjack-trainer.co`, `blackjack-trainer.co`, and `www.blackjack-trainer.co`).
- [x] Put the API behind an HTTPS reverse proxy or a managed platform that terminates HTTPS.
- [x] Create separate staging and production environments.
- [x] Configure production environment variables and secrets outside the repository.
- [x] Set `NODE_ENV=production`.
- [x] Set `ALLOWED_ORIGINS` to the exact deployed HTTPS origin.
- [x] Set `ALLOW_FILE_ORIGIN=false`.
- [x] Configure `TRUST_PROXY_HOPS` for the actual proxy chain.
- [x] Generate unique database credentials and store them outside the repository.

## Database and migrations

- [x] Add a versioned migration runner instead of relying only on PostgreSQL initialization scripts.
- [x] Run pending migrations automatically or as an explicit release step before the new application starts.
- [x] Create a dedicated, least-privilege PostgreSQL role for the staging API. Separate release/runtime credentials are configured; the user confirmed the staging transition is working.
- [x] Create a dedicated, least-privilege PostgreSQL role for the production API. Verified on 2026-10-05: restricted login and application-table reads, runtime credential switch, health check, application smoke checks, and no database permission errors.
- [x] Keep PostgreSQL on a private network.
- [ ] Require certificate-verified TLS if PostgreSQL is hosted on another machine.
- [x] Configure encrypted automatic backups on staging and production. Staging setup was user-confirmed; production setup was verified on 2026-10-05, including a successful systemd backup, daily timer, verified offsite archives/key, recovery configuration copies, and temporary server-key cleanup. Retention is 30 days; ongoing offsite copies remain an operations task.
- [x] Perform and document a database restore test on staging and production. Staging restore was user-confirmed; production pre-transition and post-transition restores passed on 2026-10-05, with both generated databases removed. Evidence is recorded in private operations notes.
- [ ] Add monitoring for database availability, storage, and connection usage.

## CI and deployment pipeline

- [x] Add a GitHub Actions pull-request workflow.
- [x] Run the backend syntax check in CI.
- [x] Run the blackjack simulation in CI.
- [x] Run the production dependency audit in CI.
- [x] Add automated API and PostgreSQL integration tests.
- [x] Deploy pushes to `dev` into the staging environment.
- [x] Deploy merges to `main` into the production environment.
- [x] Configure separate GitHub staging and production environments and secrets.
- [ ] Require passing checks before merging into `dev` or `main`.
- [ ] Require manual approval for production deployment if appropriate.
- [x] Prevent concurrent deployments to the same environment.

## Container and runtime reliability

- [x] Add API and PostgreSQL container health checks.
- [x] Make API startup wait for a healthy database or retry failed initial connections.
- [x] Add suitable container restart policies.
- [x] Handle `SIGTERM` and `SIGINT` for graceful HTTP server and PostgreSQL pool shutdown.
- [ ] Confirm persistent database storage survives application redeployments.
- [ ] Pin or regularly update production container image versions.
- [ ] Test the complete production container configuration before launch.

## Security configuration

- [x] Create a Cloudflare Turnstile widget for the production hostname. Separate staging/production widgets were created and real browser signup passed on both environments on 2026-10-05.
- [x] Configure `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, and `TURNSTILE_EXPECTED_HOSTNAME`. Applied privately using the helper on both servers; configuration checks and real signup passed on 2026-10-05. Keys remain outside Git and are saved in separate 1Password entries.
- [x] Set `REQUIRE_SIGNUP_CAPTCHA=true` in production. Saved settings and running public configuration were verified; production browser signup passed on 2026-10-05.
- [ ] Configure the Google OAuth production origin and client ID if Google sign-in is enabled. Both deployed environments reported Google disabled on 2026-10-05; optional setup is documented.
- [x] Verify secure `__Host-` authentication cookies over the deployed HTTPS connection. User confirmed Secure/HttpOnly, SameSite=Lax, Path=/, retained login after refresh, logout, and login/statistics on staging and production on 2026-10-05; expiry/revocation are also covered by integration tests.
- [x] Confirm CSP, HSTS, CORS, Origin checks, and rate limiting in staging. Deployed HTTPS/header/CORS/blocked-write checks passed on 2026-10-05; a bounded public-GET check returned HTTP 429 on request 121 with Retry-After. Authentication limits and restart persistence are covered by isolated production-mode tests.
- [x] Add secret rotation and incident-response procedures. See `deploy/security/operations.md`.
- [x] Schedule regular dependency and container vulnerability scans. Weekly/manual npm and API/PostgreSQL/Caddy scans were merged into main via PR #34 on 2026-10-05. Scan findings/results still require ongoing review; scheduling does not establish that deployed images are vulnerability-free.

## Monitoring and operations

- [x] Add structured application and request logging without recording passwords, tokens, or other secrets.
- [ ] Send production logs to persistent centralized storage.
- [ ] Add uptime monitoring for the website and `/api/health`.
- [ ] Add alerts for repeated server errors, database failures, and resource exhaustion.
- [ ] Define log-retention and database-retention policies.
- [ ] Document deployment, rollback, backup, and restore procedures.
- [ ] Test a rollback in staging.

## Account readiness

- [ ] Add email-address verification.
- [ ] Add a forgotten-password and password-reset flow.
- [ ] Add an account-deletion flow.
- [ ] Consider a “log out everywhere” option and session/device management.
- [ ] Publish a privacy policy and terms of use before collecting public account data.
- [ ] Document what user and gameplay data is stored and for how long.

## Test coverage

- [x] Test registration, login, logout, cookie expiry, and invalid credentials automatically. Production-mode security integration tests also verify host-cookie flags and restricted database writes.
- [ ] Test Google authentication with an appropriate test strategy.
- [x] Test session ownership and anonymous-session claiming. Tests verify claiming an anonymous session and reject cross-account claiming/statistics/hand writes.
- [x] Test authentication and global rate limits. Tests cover signup IP limits, login identity limits across different IPs and API restarts, and global Retry-After/window expiry.
- [x] Test Turnstile success, rejection, timeout, and unavailable-service behavior. Tests also cover hostname/action mismatches, replay/expiry responses, malformed responses, and log redaction.
- [x] Test migration of both a new database and an existing database, including repeat/concurrent runs, rollback, immutable history, and restricted API-role permissions.
- [ ] Add browser tests for the main game, split aces, responsive layout, and account/statistics flows. Initial desktop/mobile Chromium coverage now tests split aces, served navigation, login-dialog focus/error handling, login/logout controls, session/user statistics tabs, hints/review and four-hand layout with mocked API data; full account/statistics persistence and additional browser engines remain open.
- [ ] Run a staging smoke test after every deployment.

## Product trust boundary

- [ ] Keep the documented warning that gameplay results and statistics are supplied by the browser.
- [ ] Move game resolution and trusted statistics to the server before introducing rankings, prizes, financial use, or competitive results.

## Launch gates

### Staging

- [x] HTTPS staging URL is available.
- [x] Staging database and secrets are separate from production.
- [ ] Migrations, health checks, automated tests, logging, and backups are working.
- [x] Registration, login, gameplay, and user statistics pass a complete smoke test.

### Public beta

- [ ] All immediate blockers are complete.
- [ ] Turnstile and production rate limits are enabled.
- [ ] Monitoring, alerting, backups, and rollback are verified.
- [ ] Privacy policy, account deletion, and support contact are available.

### Production

- [ ] CI/CD deploys only reviewed and tested code from `main`.
- [ ] Restore and rollback procedures have been exercised successfully.
- [ ] Security configuration has been reviewed against `SECURITY.md`.
- [ ] Known limitations are documented and accepted.
