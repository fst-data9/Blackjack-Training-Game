# Production deployment

Production uses the same container layout as staging, with PostgreSQL and the
API kept on Docker's private network. Caddy is the only service published on
the VPS's public HTTP and HTTPS ports.

The DNS zone should point the apex domain to the production server and use a
CNAME for `www`:

```text
@     A       <production IPv4>
www   CNAME   blackjack-trainer.co
```

Caddy serves both `blackjack-trainer.co` and `www.blackjack-trainer.co` over
HTTPS.

The production server checkout must use `main` and provide these files outside
version control:

- `/opt/blackjack/.env`
- `/opt/blackjack/backend/.env`
- `/opt/blackjack/backend/.env.migrations`

Keep all three files at permission `600`. Before upgrading an existing server,
follow the [database role transition](../../database/README.md#existing-staging-or-production-server-transition).

`backend/.env` must include production values similar to:

```dotenv
DATABASE_URL=postgres://blackjack_production_api:REPLACE_WITH_API_SECRET_AT_LEAST_24_CHARACTERS@postgres:5432/blackjack_production
PORT=3001
NODE_ENV=production
ALLOWED_ORIGINS=https://blackjack-trainer.co
ALLOW_FILE_ORIGIN=false
TRUST_PROXY_HOPS=1
# Set true only after the Turnstile keys below are configured.
REQUIRE_SIGNUP_CAPTCHA=false
```

The root `.env` retains the administrator settings and a unique production
volume name (keep the current values when upgrading an existing database):

```dotenv
POSTGRES_DB=blackjack_production
POSTGRES_USER=blackjack_production
POSTGRES_PASSWORD=REPLACE_WITH_SECRET
POSTGRES_VOLUME_NAME=blackjack_production_pgdata
```

`backend/.env.migrations` supplies owner credentials only to the release step:

```dotenv
DATABASE_URL=postgres://blackjack_production:REPLACE_WITH_SECRET@postgres:5432/blackjack_production
DATABASE_APP_USER=blackjack_production_api
DATABASE_APP_PASSWORD=REPLACE_WITH_API_SECRET_AT_LEAST_24_CHARACTERS
DB_QUERY_TIMEOUT_MS=65000
DB_STATEMENT_TIMEOUT_MS=60000
```

Use the same API password here and in `backend/.env`, and keep the administrator
password matching the root `.env`. The release service applies migrations and
refreshes restricted API grants before the application starts.

The `production` GitHub environment must contain separate secrets:

| Secret | Purpose |
| --- | --- |
| `PRODUCTION_HOST` | Production VPS hostname or IP address |
| `PRODUCTION_USER` | SSH user allowed to deploy `/opt/blackjack` |
| `PRODUCTION_SSH_PRIVATE_KEY` | Private key for that SSH user |
| `PRODUCTION_KNOWN_HOSTS` | Verified `known_hosts` entry for the production host |

Configure required reviewers for the `production` environment in GitHub so
the deployment job pauses for approval before connecting to the server.

After approval, the workflow runs `scripts/deploy-production.sh` from a push
to `main` after all required CI checks pass.

## Verification

```sh
curl --fail https://blackjack-trainer.co/api/health
curl --fail https://www.blackjack-trainer.co/api/health
docker compose -f docker-compose.yml -f deploy/production/docker-compose.yml ps
```

## Request analytics

Caddy writes structured request logs to the container output. On the server,
install `jq` once and run the report from the repository root:

```sh
sudo apt install jq
CADDY_CONTAINER=blackjack-caddy bash scripts/request-report.sh 24h
```

The report includes total requests, approximate unique client IPs, status
codes, and the most-requested paths. Client IPs are retained only in the
rotated Docker logs; do not publish the raw logs. Unique-client counts are
approximate because multiple people may share an IP and one person may use
multiple addresses.
