# Blackjack Training Game

This is a small blackjack trainer for basic strategy practice. The browser game can run as a static page, and the optional backend records completed hands to PostgreSQL for later SQL practice and analysis.

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
   ```

2. Start the API and database with Podman.

   ```sh
   podman-compose up --build
   ```

3. Open `http://localhost:3001` in a browser to play the game.

The API serves the browser game at the same address so secure, HttpOnly login cookies work locally. Opening `index.html` directly is still useful for game-only development, but account cookies may be restricted by the browser in `file://` mode.

The SQL files in `database/init/` run automatically when Podman creates a new Postgres data volume. If `blackjack_pgdata` already exists, Podman will keep the current database as-is.

For an existing database created before login support was added, apply the authentication migration once:

```sh
podman cp database/init/002_auth.sql blackjack-postgres:/tmp/002_auth.sql
podman exec blackjack-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /tmp/002_auth.sql'
podman cp database/init/003_session_stats.sql blackjack-postgres:/tmp/003_session_stats.sql
podman exec blackjack-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /tmp/003_session_stats.sql'
podman cp database/init/004_security.sql blackjack-postgres:/tmp/004_security.sql
podman exec blackjack-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /tmp/004_security.sql'
```

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

```sh
podman-compose up --build
podman-compose down
podman ps
podman logs blackjack-api
podman logs blackjack-postgres
```

The same Compose file can also be used with Docker-compatible deployment tooling later because it builds standard container images.
