# Database migrations

For scheduled encrypted backups and restore checks on the existing VPS, see
[the backup setup guide](../deploy/backups/README.md).

Migration files live in `database/init` and use ordered names such as
`005_add_example.sql`. The same files initialize a new PostgreSQL volume and are
also applied to existing databases by the migration runner.

Run all pending migrations from the repository root with:

```sh
podman-compose run --rm migrate
```

The same non-interactive command is available as a reusable script:

```sh
./scripts/migrate.sh
```

When running the backend directly instead of through Compose:

```sh
npm --prefix backend run db:prepare
```

The runner creates `schema_migrations`, takes a PostgreSQL advisory lock so only
one deployment can migrate at a time, and applies every pending file in its own
transaction. A SHA-256 checksum is stored for each applied migration.

Applied migration files are immutable. Never edit or rename one after it has
run in any shared environment. Add a new numbered migration for every schema
change instead.

New migrations must have a number higher than every applied version. The runner
checks all applied filenames and checksums before running any pending SQL, and
rejects attempts to insert an older migration into an existing history.

Use this command to validate migration filenames and contents without connecting
to PostgreSQL:

```sh
npm --prefix backend run migrate:check
```

## Runtime and release database roles

The API uses a separate login with only `CONNECT`, public-schema `USAGE`,
`SELECT` / `INSERT` / `UPDATE` / `DELETE` on the application tables, and `USAGE`
on the hand-ID sequence. It cannot create schemas, temporary tables, or roles,
alter/drop/truncate tables, or read/write `schema_migrations`.

`npm --prefix backend run db:prepare` runs migrations and provisions that login
in two steps. Provisioning is transactional and safe to repeat. If provisioning
fails after migrations succeed, correct the configuration and rerun; the runner
skips already applied files. Only mark the release successful after both steps.

Provisioning rejects the migration login itself, privileged existing logins,
role memberships, and roles that own database objects. Existing application
data and ownership stay with the database administrator. Because privileges can
also come from `PUBLIC`, provisioning removes its table/sequence rights,
public-schema `CREATE`, and database `CREATE` / `TEMPORARY` rights. Use this
workflow for the application's dedicated database, not a shared application
schema in another project's database.

Application tables are explicitly listed in `backend/provision-db-role.js`.
Add new API tables to this list when creating new migrations. The release step
refreshes grants after migrations; it deliberately does not give default access
to every future table or to the migration ledger. See PostgreSQL's
[privilege rules](https://www.postgresql.org/docs/16/ddl-priv.html).

Secrets are split between these files (all outside Git, permission `600`):

| File | Used by | Credentials |
| --- | --- | --- |
| `.env` | PostgreSQL container initialization | Existing database administrator |
| `backend/.env.migrations` | One-off `migrate` service / release CLI | Database owner and desired API-role name/password |
| `backend/.env` | Running API | Restricted API-role connection URL only |

The root `.dockerignore` excludes secret files from the build context. The
running API service does not receive the release credentials. Compose reads the
migration env file when loading this configuration, so create it before running
Compose commands even if the `tools` profile is not enabled.

### Existing staging or production server transition

Do this separately on each server before deploying this change:

1. Keep the existing root `.env`, `POSTGRES_USER`, database, and volume name.
   Changing container initialization variables does not rename an existing
   database user or rotate its password.
2. Copy `backend/.env.migrations.example` to `backend/.env.migrations`.
   Set its `DATABASE_URL` to the existing administrator URL currently used by
   the API. Set `DATABASE_APP_USER` to a new role (for example,
   `blackjack_staging_api` or `blackjack_production_api`) and
   `DATABASE_APP_PASSWORD` to a separate generated password of at least 24
   characters. Keep API and release credentials separate.
3. Build the new release image and provision the role while the old API runs:

   ```sh
   docker compose build api migrate
   docker compose run --rm migrate
   ```

4. Edit only `DATABASE_URL` in `backend/.env` to use the new API login/password,
   keeping the existing host, port, database, and other application settings.
   Percent-encode reserved characters in URL passwords (a generated hex
   password avoids this issue).
5. Restrict the files and restart the API with the appropriate environment:

   ```sh
   chmod 600 .env backend/.env backend/.env.migrations
   # Staging; use deploy/production/docker-compose.yml and --profile production there.
   docker compose -f docker-compose.yml -f deploy/staging/docker-compose.yml --profile staging up -d
   curl --fail https://staging.blackjack-trainer.co/api/health
   ```

The existing deployment scripts subsequently run the release-only service
before starting updated application containers. They stop with instructions if
`backend/.env.migrations` has not been created. CI tests registration,
gameplay/statistics writes, and logout using the restricted API role.

### Migration and privilege integration tests

Use an isolated PostgreSQL 16 instance and an administrator URL:

```sh
DATABASE_TEST_ADMIN_URL=postgres://TEST_ADMIN:TEST_PASSWORD@127.0.0.1:TEST_PORT/TEST_CONTROL_DATABASE \
  npm --prefix backend run test:database
```

The suite creates uniquely named test databases and roles, and cleans up only
those resources. It never reads the API's `.env` credentials. Without an
explicit test URL the command fails instead of reporting a successful skip.
Coverage includes fresh installs, initialization-only legacy databases, partial
upgrades, repeat/concurrent releases, rollback and retry, changed/missing files,
out-of-order versions, restricted role permissions, and safe role provisioning.
These tests run in CI before the API integration checks.

## Remote PostgreSQL

The current Compose deployment keeps PostgreSQL on the local container network.
If it moves to another machine, set `sslmode=verify-full` in both API and
release connection URLs, use the certificate's hostname, and provide the CA via
`sslrootcert` where required. Mount CA files read-only at the configured paths
in both services. Do not disable certificate verification. PostgreSQL documents
the hostname and certificate checks under
[SSL support](https://www.postgresql.org/docs/16/libpq-ssl.html).
