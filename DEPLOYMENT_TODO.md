# Deployment Readiness TODO

This checklist tracks the work required to move the Blackjack Training Game from local development to staging and then to a public production deployment.

## Immediate deployment blockers

- [x] Upgrade the API container from the end-of-life Node.js 20 image to a supported Node.js 24 LTS image.
- [ ] Choose the hosting platform and production domain.
- [ ] Put the API behind an HTTPS reverse proxy or a managed platform that terminates HTTPS.
- [ ] Create separate staging and production environments.
- [ ] Configure production environment variables and secrets outside the repository.
- [ ] Set `NODE_ENV=production`.
- [ ] Set `ALLOWED_ORIGINS` to the exact deployed HTTPS origin.
- [ ] Set `ALLOW_FILE_ORIGIN=false`.
- [ ] Configure `TRUST_PROXY_HOPS` for the actual proxy chain.
- [ ] Generate unique database credentials and store them in a secret manager.

## Database and migrations

- [x] Add a versioned migration runner instead of relying only on PostgreSQL initialization scripts.
- [x] Run pending migrations automatically or as an explicit release step before the new application starts.
- [ ] Create a dedicated, least-privilege PostgreSQL role for the API.
- [ ] Keep PostgreSQL on a private network.
- [ ] Require certificate-verified TLS if PostgreSQL is hosted on another machine.
- [ ] Configure encrypted automatic backups.
- [ ] Perform and document a database restore test.
- [ ] Add monitoring for database availability, storage, and connection usage.

## CI and deployment pipeline

- [x] Add a GitHub Actions pull-request workflow.
- [x] Run the backend syntax check in CI.
- [x] Run the blackjack simulation in CI.
- [x] Run the production dependency audit in CI.
- [x] Add automated API and PostgreSQL integration tests.
- [ ] Deploy pushes to `dev` into the staging environment.
- [ ] Deploy merges to `main` into the production environment.
- [ ] Configure separate GitHub staging and production environments and secrets.
- [ ] Require passing checks before merging into `dev` or `main`.
- [ ] Require manual approval for production deployment if appropriate.
- [ ] Prevent concurrent deployments to the same environment.

## Container and runtime reliability

- [ ] Add API and PostgreSQL container health checks.
- [ ] Make API startup wait for a healthy database or retry failed initial connections.
- [ ] Add suitable container restart policies.
- [ ] Handle `SIGTERM` and `SIGINT` for graceful HTTP server and PostgreSQL pool shutdown.
- [ ] Confirm persistent database storage survives application redeployments.
- [ ] Pin or regularly update production container image versions.
- [ ] Test the complete production container configuration before launch.

## Security configuration

- [ ] Create a Cloudflare Turnstile widget for the production hostname.
- [ ] Configure `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, and `TURNSTILE_EXPECTED_HOSTNAME`.
- [ ] Set `REQUIRE_SIGNUP_CAPTCHA=true` in production.
- [ ] Configure the Google OAuth production origin and client ID if Google sign-in is enabled.
- [ ] Verify secure `__Host-` authentication cookies over the deployed HTTPS connection.
- [ ] Confirm CSP, HSTS, CORS, Origin checks, and rate limiting in staging.
- [ ] Add secret rotation and incident-response procedures.
- [ ] Schedule regular dependency and container vulnerability scans.

## Monitoring and operations

- [ ] Add structured application and request logging without recording passwords, tokens, or other secrets.
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

- [ ] Test registration, login, logout, cookie expiry, and invalid credentials automatically.
- [ ] Test Google authentication with an appropriate test strategy.
- [ ] Test session ownership and anonymous-session claiming.
- [ ] Test authentication and global rate limits.
- [ ] Test Turnstile success, rejection, timeout, and unavailable-service behavior.
- [ ] Test migration of both a new database and an existing database.
- [ ] Add browser tests for the main game, split aces, responsive layout, and account/statistics flows.
- [ ] Run a staging smoke test after every deployment.

## Product trust boundary

- [ ] Keep the documented warning that gameplay results and statistics are supplied by the browser.
- [ ] Move game resolution and trusted statistics to the server before introducing rankings, prizes, financial use, or competitive results.

## Launch gates

### Staging

- [ ] HTTPS staging URL is available.
- [ ] Staging database and secrets are separate from production.
- [ ] Migrations, health checks, automated tests, logging, and backups are working.
- [ ] Registration, login, gameplay, and user statistics pass a complete smoke test.

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
