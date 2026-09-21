# Staging deployment

This deployment keeps PostgreSQL and the API on Docker's private network. Caddy
is the only service published on the VPS's public HTTP and HTTPS ports.

## Server setup

Run these commands from `/opt/blackjack` after checking out `dev`:

```sh
docker compose -f docker-compose.yml -f deploy/staging/docker-compose.yml build
docker compose -f docker-compose.yml -f deploy/staging/docker-compose.yml run --rm api npm run migrate
docker compose -f docker-compose.yml -f deploy/staging/docker-compose.yml --profile staging up -d
docker compose -f docker-compose.yml -f deploy/staging/docker-compose.yml ps
```

The staging environment must provide `/opt/blackjack/.env` and
`/opt/blackjack/backend/.env` separately from development and production.

`backend/.env` should include at least:

```dotenv
DATABASE_URL=postgres://blackjack_staging:REPLACE_WITH_SECRET@postgres:5432/blackjack_staging
PORT=3001
NODE_ENV=production
ALLOWED_ORIGINS=https://staging.blackjack-trainer.co
ALLOW_FILE_ORIGIN=false
TRUST_PROXY_HOPS=1
```

The root `.env` should contain matching PostgreSQL settings:

```dotenv
POSTGRES_DB=blackjack_staging
POSTGRES_USER=blackjack_staging
POSTGRES_PASSWORD=REPLACE_WITH_SECRET
POSTGRES_VOLUME_NAME=blackjack_staging_pgdata
```

Keep both files outside version control and set their permissions to `600`.

## Verification

```sh
curl --fail https://staging.blackjack-trainer.co/api/health
docker compose -f docker-compose.yml -f deploy/staging/docker-compose.yml ps
```

The API and PostgreSQL ports are bound only to the VPS loopback interface by
the base Compose file; do not add firewall rules for ports 3001 or 5432.
