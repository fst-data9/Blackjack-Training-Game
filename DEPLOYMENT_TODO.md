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

SEO/analytics investigation on 2026-10-11: public production sitemap and robots
returned 200 with valid XML/content types; all four sitemap pages returned 200
and matching production canonicals. HTTP and www redirected to the HTTPS apex
(308 and 301). User screenshots confirm the correct domain property
and submitted URL and an indexed homepage. The sitemap detail reports last read
2026-10-10 and “Sitemap could not be read”, without a specific fetch reason;
the user subsequently reported a successful live sitemap test. User-provided
Caddy logs show sitemap HTTP 200 responses to Google Inspection Tool at
2026-10-11 00:03:30–31 and 00:05:18 UTC, and to full Googlebot user agents at
00:04:33 and 00:04:54 UTC. Crawler source IPs were omitted and have not been
verified. Earlier short `Googlebot` user-agent entries were diagnostic probes.
The supplied logs do not establish the original failure cause or successful
sitemap processing in Search Console; no current HTTP fetch failure appears.
Analytics CSP blocked the existing manual beacon; a local fix and browser regression are
prepared; backend checks, security tests and all 62 browser tests passed, with
the final analytics test also passing on desktop/mobile after API mocking.
Review/deployment and dashboard verification remain pending. Staging public
responses lacked the configured Caddy `X-Robots-Tag`; the staging deployment
script now recreates Caddy to refresh its file mount, matching production.
Verify the public header after deployment. See
[Search Console diagnostics](docs/search-console.md).

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

## Learning URLs and AdSense preparation (2026-10-11)

- [x] Prepare individual lesson/term/chart-topic URLs with initial HTML, links and sitemap entries locally.
- [x] Prepare disabled manual learning-content ad slots and consent-gated loader; no live ads activated.
- [ ] Obtain publisher/display-unit IDs and confirm Google site review status.
- [ ] Publish accurate privacy disclosures, choose/configure a certified CMP, complete CSP/ads.txt integration and consent/browser verification before activation. See `docs/adsense.md`.
- [x] Review and deploy learning routes; verify public URLs after authorized deployment. Staging and production deployment and public smoke checks passed on 2026-10-11 via PRs #52/#53.

Local validation: backend checks and security tests passed; 70 desktop/mobile
browser tests passed, followed by 22 updated SEO checks covering all 31 topics
and direct nested-page asset loading. Database suites were not run (no database
changes). Google approval, live ad delivery, CMP and deployed URLs are unverified.

AdSense follow-up: owner supplied publisher ID and selected Google’s CMP.
Verification meta tag prepared locally; production publication and Google
verification/review remain pending. Display ad-unit ID is still needed.

Deployment evidence (2026-10-11): PR #52 merged to dev at `ea1a4c5`;
staging workflow `38101312332` succeeded. PR #53 merged to main at
`342de0b`; production workflow `38101432599` succeeded after all required
checks. HTTPS checks verified all 35 sitemap pages, canonical metadata,
initial topic content, the publisher verification meta tag, frontend assets,
disabled live ads and healthy API on both hosts; staging noindex was verified.
Production desktop/mobile Chromium smoke checks passed with data requests
mocked: active-round preservation, topic navigation, chart selection,
viewport fit, no JavaScript errors and no ad requests. Google verification
and approval have not been performed by this chat.

## Strategy simulation page (2026-10-26)

- [x] Implement `/simulation` locally with flat/Martingale betting, custom hard/soft/pair decisions, finite bankroll/table limits, 1k/10k/100k-round server runs and profit/loss/outcome charts.
- [x] Add bounded worker execution, per-IP admission limits, server-generated seeds/results and summary-only storage in `005_simulation_runs.sql`; no individual simulated hands enter the hands table.
- [x] Add deterministic engine/strategy-parity/API tests, desktop/mobile browser scenarios, CI checks and migration/role test coverage.
- [ ] Execute the migration and restricted-role integration suite against an isolated PostgreSQL 16 instance (no local test server or test administrator URL available in this session).
- [ ] Review and deploy through the authorized release process; run migration and role provisioning before enabling simulations, then verify persisted summaries on staging.

Local validation: backend syntax/migration-file checks, security tests, existing
51 deterministic gameplay scenarios plus 1,000 seeded rounds, and eight new
server engine/worker/API tests passed. Database writes in the new API tests are
mocked; this does not verify PostgreSQL persistence. Browser verification covers
both desktop and mobile Chromium. No deployment or changes to real databases
were performed. Run history, saved strategy retrieval and summary retention
scheduling remain future work.

### Strategy presets, guide and downloads (2026-10-26)

- [x] Research and implement Paroli, D’Alembert and Fibonacci alongside flat/Martingale bets; add the original Wave/Pulse betting experiments and basic/mimic/never-bust/Chase 20/Split party playing presets.
- [x] Add a server-rendered Strategies overview and 12 individual guide URLs with rules, examples, pros/cons, research links and explicit original-experiment labels.
- [x] Add browser-local JSON/CSV result downloads and PNG/SVG exports for both simulation charts; add CSV/PNG/SVG downloads for the selected basic-strategy table.
- [x] Validate documented betting sequences, caps, pushes, preset combinations and download content. All 11 engine/worker/API tests and the full 92 desktop/mobile browser tests passed; backend checks and `git diff --check` passed. PNG exports and the mobile guide were visually inspected.

Downloads preserve the completed run snapshot, units and settings, even after
form edits. Engine version is now 2. No additional migration is required by the
preset/export extension; the initial simulation migration and PostgreSQL
integration verification above remain prerequisites for release. No deployment
or real-database operations were performed.

## Card counting training (2026-10-26)

- [x] Add `/counting` with the existing table styling, beginner lessons, eight counting systems, tag/running/true-count drills, paired reveals, configurable shoe size/penetration, optional hints and aces-seen tracking.
- [x] Add navigation, canonical metadata, generated sitemap inclusion, explicit asset routes and Docker image copies. Preserve Practice state and keep drill results browser-local.
- [x] Verify desktop/mobile counting, gameplay and SEO (94 checks), then final counting scenarios including hidden hints, ace feedback and no-JavaScript lessons (10 checks). Backend checks, changed-script syntax and `git diff --check` passed; desktop/mobile screenshots inspected.
- [ ] Review and deploy through the authorized release process.

Research sources are linked on the page. Eight major systems are supported, not
all published techniques. Unbalanced drills use a documented zero-based practice
count, with no betting indexes; balanced true counts use exact decks remaining
and truncation toward zero. No wager recommendations or full deviation tables
are implemented. No database changes or deployment were performed.
