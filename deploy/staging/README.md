# Staging deployment

This deployment keeps PostgreSQL and the API on Docker's private network. Caddy
is the only service published on the VPS's public HTTP and HTTPS ports.

## Server setup

Run these commands from `/opt/blackjack` after checking out `dev`:

For repeat deployments, use the checked-in script:

```sh
bash scripts/deploy-staging.sh
```

It requires a clean `dev` checkout, fast-forwards from `origin/dev`, builds the
API, applies migrations, starts the staging profile, and checks the HTTPS health
endpoint.

The equivalent manual commands are:

```sh
docker compose -f docker-compose.yml -f deploy/staging/docker-compose.yml build
docker compose -f docker-compose.yml -f deploy/staging/docker-compose.yml run --rm api npm run migrate
docker compose -f docker-compose.yml -f deploy/staging/docker-compose.yml --profile staging up -d
docker compose -f docker-compose.yml -f deploy/staging/docker-compose.yml ps
```

The staging environment must provide `/opt/blackjack/.env` and
`/opt/blackjack/backend/.env` separately from development and production.
The server checkout must also have permission to fast-forward from
`origin/dev`, either through a deploy key or another non-interactive Git
credential.

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

## GitHub Actions deployment

The `staging` GitHub environment must contain these secrets:

| Secret | Purpose |
| --- | --- |
| `STAGING_HOST` | Staging VPS hostname or IP address |
| `STAGING_USER` | SSH user allowed to deploy `/opt/blackjack` |
| `STAGING_SSH_PRIVATE_KEY` | Private key for that SSH user |
| `STAGING_KNOWN_HOSTS` | Exact `known_hosts` entry for the staging host |

After the required CI checks pass, a push to `dev` connects to the host and
runs `scripts/deploy-staging.sh`. Deployments are serialized so two staging
deployments cannot run at the same time.

## Verification

```sh
curl --fail https://staging.blackjack-trainer.co/api/health
docker compose -f docker-compose.yml -f deploy/staging/docker-compose.yml ps
```

The API and PostgreSQL ports are bound only to the VPS loopback interface by
the base Compose file; do not add firewall rules for ports 3001 or 5432.
