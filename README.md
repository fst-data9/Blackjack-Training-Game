# Blackjack Training Game

This is a small blackjack trainer for basic strategy practice. The browser game can run as a static page, and the optional backend records completed hands to PostgreSQL for later SQL practice and analysis.

The trainer allows continued play after splitting aces, using the same actions
as other split hands. A split hand reaching 21 automatically advances to the
next unfinished hand; the dealer plays after all player hands finish. A split
ace plus a ten-value card counts as regular 21, not a natural blackjack, and
pays 1:1 on a win. This split-ace rule differs from casinos that permit only one
card per split ace; the displayed -0.5% expected return is a rough estimate,
not a calculation for the trainer's exact rules.

## Goals

- [ ] Practice PostgreSQL SQL syntax and features
- [x] Design and evolve database schemas
- [ ] Write and optimize analytical queries
- [ ] Experiment with indexes, constraints, and performance tuning
- [ ] Maintain a versioned library of reusable SQL queries
- [x] Connect a database to the Blackjack training application and store results
- [x] Create users under the blackjack app
- [ ] Automate testing of the UI and data in PostgreSQL

## Tech Stack

- **Game:** HTML, CSS, and JavaScript
- **API:** Node.js, Express, and `pg`
- **Database:** PostgreSQL
- **Local services:** Podman Compose

## Repository Structure

```text
.
├── index.html                 # Static browser UI
├── blackjack-game.js          # Game logic and API calls
├── images/                    # Strategy image and playing-card assets
├── backend/                   # Express API for recording sessions and hands
│   ├── server.js
│   ├── package.json
│   ├── Dockerfile
│   └── .env.example
├── database/
│   └── init/
│       └── 001_schema.sql     # Tables loaded into fresh Postgres volumes
├── docker-compose.yml         # Podman/Docker Compose services
└── .env.example               # Compose-level Postgres settings
```

## Local Setup

1. Copy the example env files and adjust values if needed.

   ```sh
   cp .env.example .env
   cp backend/.env.example backend/.env
   cp backend/.env.migrations.example backend/.env.migrations
   ```

   Use the same administrator credentials in `.env` and
   `backend/.env.migrations`. The API's `backend/.env` uses a separate role and
   password matching `DATABASE_APP_USER` / `DATABASE_APP_PASSWORD` in the
   migration file. Restrict the secret files to permission `600`.

2. Initialize the database, provision the API role, then start the API.

   ```sh
   podman-compose up -d postgres
   podman-compose build api migrate
   bash scripts/migrate.sh
   podman-compose up -d api
   ```

3. Open `http://localhost:3001` in a browser to play the game.

The API serves the browser game at the same address so secure, HttpOnly login cookies work locally. Opening `index.html` directly is still useful for game-only development, but account cookies may be restricted by the browser in `file://` mode.

The SQL files in `database/init/` run automatically when Podman creates a new Postgres data volume. If `blackjack_pgdata` already exists, Podman will keep the current database as-is. Apply any pending migrations to an existing database with the versioned migration runner:

```sh
podman-compose run --rm migrate
```

The runner records applied files and their checksums in `schema_migrations`, prevents concurrent migration runs, and applies each pending migration transactionally. The release service also provisions the restricted API role. See [database/README.md](database/README.md) for the migration workflow, existing-server transition, and integration tests.

## Accounts and Google sign-in

Email/password accounts work without extra configuration. Passwords are stored as salted PBKDF2-SHA256 hashes, and login tokens are kept in expiring HttpOnly cookies. Anonymous sessions are linked to the account when a player signs in.

The stats card can switch between the current browser session and cumulative user totals. Session snapshots are stored in PostgreSQL and associated through `sessions.user_id`; saving the same snapshot again updates it rather than double-counting it.

Google sign-in is optional. To enable it:

1. Create an OAuth 2.0 **Web application** client in Google Cloud.
2. Add `http://localhost:3001` as an authorized JavaScript origin for local development, plus the deployed HTTPS origin later.
3. Set `GOOGLE_CLIENT_ID` in `backend/.env` to that web client ID.
4. Rebuild the API with `podman-compose up -d --build api`.

The Google button is enabled automatically when the API reports a configured client ID. Google ID tokens are verified by the backend with Google's official Node.js library before an account is created or a session is linked.

## Production security

See [SECURITY.md](SECURITY.md) for the threat checklist and deployment requirements. To protect account creation with Cloudflare Turnstile, set `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_EXPECTED_HOSTNAME`, and `REQUIRE_SIGNUP_CAPTCHA=true` in `backend/.env`. Keep PostgreSQL on a private network and use a dedicated least-privilege database role in production.

For local `file://` play, `backend/.env.example` enables `ALLOW_FILE_ORIGIN=true`. Before deploying publicly, set `ALLOW_FILE_ORIGIN=false` and set `ALLOWED_ORIGINS` to the deployed frontend origin only.

## Useful Commands

### Gameplay checks

Run `npm run test:sim` for deterministic gameplay regressions followed by 1,000
random rounds. `npm run test:sim:long` runs 10,000 random rounds. Every run checks
opening blackjack, insurance, win/loss/push, surrender, doubling, splits and
resplits, bankroll restrictions, monetary rounding, decision feedback, review,
shoe transitions, card scoring and strategy-chart fallbacks.

Random play is seeded so failures can be reproduced. Supply the round count and
seed directly, for example `node tests/blackjack-sim.js 10000 42`. The default
seed is `123456789`; try additional seeds for varied play. Output lists the
deterministic coverage and seed. The checker uses a mock DOM and mock API, so
real browser layout, navigation, account flows and persistence still require
browser/API integration checks. This is rule and transition coverage, not an
exhaustive enumeration of all possible shoes.

### Real browser checks

Install the browser-test dependencies once, then run the desktop and mobile
Chromium suites:

```sh
npm ci
npm ci --prefix backend
npx playwright install chromium
npm run test:browser
```

On Linux CI, use `npx playwright install --with-deps chromium` to install browser
system dependencies too. The suite starts a dedicated local Express server on
port 3101 and tests the actual served scripts, security headers, DOM events,
split-ace transitions, navigation, login-dialog focus/error recovery,
login/logout controls, session/user statistics tabs, review and
four-hand responsive layout. All `/api/` data requests are intercepted; no
PostgreSQL service or real accounts are used. Server-side authentication and
database persistence remain covered by the separate integration tests.

Failures save screenshots and Playwright traces under ignored `test-results/`.
The browser job runs on pull requests and blocks staging/production deployment
when it fails. Add scenarios here for browser-specific bugs, alongside simulation
cases for the underlying game rules.

### Services

```sh
podman-compose up --build
podman-compose down
podman ps
podman logs blackjack-api
podman logs blackjack-postgres
```

The same Compose file can also be used with Docker-compatible deployment tooling later because it builds standard container images.
