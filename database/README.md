# Database migrations

Migration files live in `database/init` and use ordered names such as
`005_add_example.sql`. The same files initialize a new PostgreSQL volume and are
also applied to existing databases by the migration runner.

Run all pending migrations from the repository root with:

```sh
podman-compose run --rm api npm run migrate
```

The same non-interactive command is available as a reusable script:

```sh
./scripts/migrate.sh
```

When running the backend directly instead of through Compose:

```sh
npm --prefix backend run migrate
```

The runner creates `schema_migrations`, takes a PostgreSQL advisory lock so only
one deployment can migrate at a time, and applies every pending file in its own
transaction. A SHA-256 checksum is stored for each applied migration.

Applied migration files are immutable. Never edit or rename one after it has
run in any shared environment. Add a new numbered migration for every schema
change instead.

Use this command to validate migration filenames and contents without connecting
to PostgreSQL:

```sh
npm --prefix backend run migrate:check
```
