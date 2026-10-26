# Project guidance

## Start here

- Read `README.md` for setup and `DEPLOYMENT_TODO.md` for project progress and remaining work. Read the relevant database/deployment/security guide before changing those areas.
- Inspect `git status` and the current branch before editing; preserve unrelated user changes.
- Treat dated deployment reports and checked TODO items as recorded evidence, not proof of current server state. Verify relevant state before operational changes. Keep progress in `DEPLOYMENT_TODO.md` rather than duplicating its checklist here.
- Make focused changes within the requested scope. Do not treat unfinished TODO items as authorization to implement or deploy them.

## Architecture and file map

This is a basic-strategy blackjack trainer with a static browser frontend and an optional Express/PostgreSQL backend. Anonymous play must remain available. There is no frontend framework or bundler. Root development dependencies provide Playwright browser tests.

| Area | Files and responsibilities |
| --- | --- |
| Browser UI | `index.html`: markup, inline CSS, responsive layout, account dialog, stats, review and placeholder pages |
| Game | `blackjack-game.js`: shoe, rules, bankroll, actions, strategy feedback, incorrect-decision review, session stats and API writes |
| Accounts | `auth.js`: login/registration dialog, Google/Turnstile loading, cookie-authenticated requests and account events |
| Navigation | `site-nav.js`: practice/placeholder page switching and introductory deal button |
| API | `backend/server.js`: security middleware, auth, session ownership, hand/stat writes, health, static routes and graceful shutdown |
| Security helpers | `backend/security-config.js`, `turnstile.js`, `security-log.js` |
| Database | `database/init/*.sql`, `backend/migrate.js`, `backend/provision-db-role.js`; detailed workflow in `database/README.md` |
| Local services | `docker-compose.yml`: PostgreSQL 16, API and one-off release tools; local docs use Podman Compose |
| Deployment | `deploy/staging/`, `deploy/production/`, `scripts/deploy-*.sh`: Docker Compose overlays and Caddy HTTPS proxy |
| Operations | `deploy/backups/`, `deploy/security/`, backup/restore scripts, private configuration helper and security verifier |
| CI | `.github/workflows/ci.yml`: checks, audit, PostgreSQL/API/backup integration and deployment; `security-scan.yml`: weekly/manual scans |

## Implementation conventions and invariants

- Use the existing plain JavaScript/ES-module backend approach and match surrounding formatting. Browser scripts are classic scripts loaded in order: game, auth, navigation; preserve shared globals and DOM IDs when changing them.
- Preserve keyboard access, focus handling, `hidden` states, status announcements and responsive behavior when editing the UI. Render user-controlled text safely.
- Keep game rules, strategy recommendations, displayed chart and simulation expectations consistent. Current rules include dealer standing on soft 17 and at most four split hands. Split aces allow Hit/Stand, and split hands advance automatically at 21; split-hand 21 is not a natural blackjack.
- Browser bankroll values are dollar amounts; API/database monetary fields use integer cents. Check conversions, split/double/insurance settlements and stats updates together.
- Session stats are replaceable snapshots, not increments to add again on every sync. User totals aggregate owned sessions; anonymous sessions can be claimed during authentication. Preserve ownership checks.
- Gameplay and statistics are browser-supplied and can be altered by a player. Preserve the documented trust boundary; rankings, prizes or other trusted uses require server-side game resolution.
- Keep SQL values parameterized, payload validation bounded, cookie tokens hashed in storage, and authentication/Origin/CORS/CSP/rate-limit controls intact. Never log passwords, tokens, CAPTCHA responses, secret connection URLs or raw private request data.
- When adding frontend files, update both the explicit static routes in `backend/server.js` and the copy list in `backend/Dockerfile`. A file working locally does not establish that it is served in the deployed image.

## Database changes

- Applied migrations are immutable: never edit, rename or remove them. Add a higher numbered `NNN_descriptive_name.sql` under `database/init/` (currently `001`–`004`; inspect before choosing the next number).
- Migrations initialize fresh volumes and upgrade existing databases. The runner uses checksums, advisory locking and a transaction per migration. `migrate:check` validates filenames/nonempty files without a database; it does not execute or fully validate SQL.
- Add new API-accessible tables to the explicit allowlist in `backend/provision-db-role.js`; grant sequences as required. Keep `schema_migrations` inaccessible to the API role.
- Runtime credentials belong in `backend/.env`; owner/release credentials belong in `backend/.env.migrations`; PostgreSQL initialization settings belong in root `.env`. Use example files as templates, keep real files ignored/private, and follow `database/README.md` for role transitions.
- Preserve existing administrator, database and volume identities during upgrades. Do not recreate volumes to apply migrations. Release preparation must succeed at both migration and role provisioning before starting the updated API.

## Local setup and validation

Use Node.js 24 (`>=24 <25`) and PostgreSQL 16, matching package engines and CI. Run commands from the repository root unless stated otherwise. Install backend dependencies with `npm ci --prefix backend`; install browser-test dependencies with root `npm ci`. There is no generic `npm test` script.

For full local setup, follow `README.md`: prepare the three private environment files, start PostgreSQL, build API/release services, run `bash scripts/migrate.sh`, then start the API. The API serves the frontend at `http://localhost:3001`. Direct `file://` access is useful for game-only work; account cookies may be restricted and API configuration needs attention. Direct backend startup should use `cd backend` then `npm start`, since runtime dotenv loading uses the working directory.

Choose checks appropriate to the changed area:

| Change | Validation |
| --- | --- |
| Game logic | `npm run test:sim` (deterministic scenarios/matrices plus 1,000 seeded rounds); `npm run test:sim:long` for 10,000 rounds; `node tests/blackjack-sim.js ROUND_COUNT SEED` to reproduce/vary random play |
| Browser scripts | `node --check blackjack-game.js`, `node --check auth.js`, `node --check site-nav.js` for changed scripts; browser smoke checks for affected flows |
| Browser behaviour | Root `npm ci`, backend `npm ci --prefix backend`, `npx playwright install chromium`, then `npm run test:browser`; actual Express static serving, desktop/mobile Chromium, mocked data API, no database; see README |
| Backend/migrations | `npm run check --prefix backend` |
| Security/Turnstile | `npm run test:security --prefix backend` |
| Private configuration helper | `python3 -m unittest discover -s tests -p 'test_security_configuration.py'` |
| Schema/roles | Explicit isolated `DATABASE_TEST_ADMIN_URL`, then `npm run test:database --prefix backend` |
| Production-mode API security | Explicit isolated `DATABASE_TEST_ADMIN_URL`, then `npm run test:security:integration --prefix backend` |
| Running local test API | `API_URL=http://127.0.0.1:3001 npm run test:integration` |
| Backup/restore | Shell syntax checks plus `bash tests/database-backups.sh`, using an isolated container labeled `com.blackjack.backup-test=true` and explicit `BACKUP_TEST_POSTGRES_CONTAINER`; see backup guide |
| Dependencies | `npm audit --prefix backend --omit=dev --audit-level=high` (requires registry access) |

The simulation uses a mocked DOM and does not verify real browser layout, navigation or account UI. Run browser tests for UI changes, and extend relevant scenarios; gameplay changes should include split aces, insurance, doubling, surrender and decision review as applicable. The initial browser suite uses mocked data requests; full account/statistics persistence and other browser engines remain separate work.

Integration tests create data and may create/drop isolated databases and roles. Never target staging/production with these suites. Database tests require an explicit test administrator URL for meaningful coverage; skipped tests do not count as passes. See CI for the complete isolated setup and run order. Report missing runtimes, services or credentials and checks not run accurately. Documentation-only changes need review and `git diff --check`, not full runtime suites.

## Deployment and operations

- `dev` and `main` are protected branches. Make changes on a task branch and use pull requests rather than committing directly to either protected branch. Use `codex/` for new task branches unless requested otherwise.
- Pushes to `dev` deploy staging; pushes to `main` deploy production after required CI jobs pass. Account for this effect before pushing/merging; deployment authorization must come from the user's scope.
- Deployment scripts require clean checkouts on the expected branch, fast-forward from the remote, build images, run release preparation, start services and check HTTPS health. Production also recreates Caddy to load changed file mounts.
- Staging uses `staging.blackjack-trainer.co`; production uses `blackjack-trainer.co` with `www` redirected to the apex. Keep environments, databases, volumes and secrets separate.
- Follow `SECURITY.md` and `deploy/security/README.md` for production settings and acceptance. Follow `deploy/security/operations.md` for rotation/incidents and `deploy/backups/README.md` for encrypted backups, retention, restore checks and recovery. Keep private operations notes and recovery keys outside Git.
- The TODO records deployed security and backup acceptance on 2026-10-05. Remaining areas include monitoring/alerts, rollback exercises, branch protections, account verification/reset/deletion, privacy/retention and browser tests. Some historical reports/checklist gates may lag later evidence; reconcile with verification rather than marking them complete by inference.
- Keep this file focused on stable project guidance. Machine-specific temporary WSL/Codex launcher workarounds belong in troubleshooting notes, not required project setup.
