# A Basic Blackjack game for learning basic strategy

This is a small blackjack trainer for basic strategy practice. The browser game can run as a static page, and the optional backend records completed hands to PostgreSQL for later SQL practice and analysis.

## Goals

- [ ] Practice PostgreSQL SQL syntax and features
- [x] Design and evolve database schemas
- [ ] Write and optimize analytical queries
- [ ] Experiment with indexes, constraints, and performance tuning
- [ ] Maintain a versioned library of reusable SQL queries
- [x] Connect a database to the Blackjack training application and store results
- [ ] Create users under the blackjack app
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

3. Open `index.html` in a browser to play the game.

The browser talks to the API at `http://localhost:3001`.

The SQL files in `database/init/` run automatically when Podman creates a new Postgres data volume. If `blackjack_pgdata` already exists, Podman will keep the current database as-is.

## Useful Commands

```sh
podman-compose up --build
podman-compose down
podman ps
podman logs blackjack-api
podman logs blackjack-postgres
```

The same Compose file can also be used with Docker-compatible deployment tooling later because it builds standard container images.
