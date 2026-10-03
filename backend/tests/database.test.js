import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import pg from "pg";
import { provisionDatabaseRole } from "../provision-db-role.js";

const runFile = promisify(execFile);
const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceDirectory = fileURLToPath(new URL("../../database/init", import.meta.url));
const adminUrl = process.env.DATABASE_TEST_ADMIN_URL;

function databaseUrl(name, username, password) {
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  if (username) url.username = username;
  if (password) url.password = password;
  return url.toString();
}

async function connect(connectionString) {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5_000 });
  await client.connect();
  return client;
}

function migrate(connectionString, directory = sourceDirectory) {
  return runFile(process.execPath, [path.join(backendRoot, "migrate.js")], {
    cwd: backendRoot,
    env: {
      ...process.env,
      DATABASE_URL: connectionString,
      MIGRATIONS_DIR: directory,
      DB_STATEMENT_TIMEOUT_MS: "10000",
      DB_QUERY_TIMEOUT_MS: "15000",
    },
    timeout: 25_000,
  });
}

// An explicit admin URL is required. Tests never discover or use .env credentials
// and only drop resources they created with their own random names.
test("PostgreSQL migration and API-role integration", { skip: !adminUrl }, async (t) => {
  const administrator = await connect(adminUrl);
  const runId = crypto.randomBytes(6).toString("hex");
  const databases = [];
  const roles = [];
  const directories = [];
  const clients = [];
  const migrations = (await fs.readdir(sourceDirectory)).filter((file) => file.endsWith(".sql")).sort();

  t.after(async () => {
    await Promise.all(clients.map((client) => client.end()));
    try {
      for (const name of databases) {
        await administrator.query(`DROP DATABASE ${administrator.escapeIdentifier(name)} WITH (FORCE)`);
      }
      for (const name of roles) {
        await administrator.query(`DROP ROLE ${administrator.escapeIdentifier(name)}`);
      }
    } finally {
      await administrator.end();
      await Promise.all(directories.map((directory) => fs.rm(directory, { recursive: true, force: true })));
    }
  });

  async function fixture(label) {
    const name = `blackjack_test_${runId}_${label}`;
    await administrator.query(`CREATE DATABASE ${administrator.escapeIdentifier(name)}`);
    databases.push(name);
    const url = databaseUrl(name);
    const client = await connect(url);
    clients.push(client);
    return { name, url, client };
  }

  async function migrationCopy() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "blackjack-migrations-"));
    directories.push(directory);
    await fs.cp(sourceDirectory, directory, { recursive: true });
    return directory;
  }

  await t.test("fresh database migrates and repeated runs leave history unchanged", async () => {
    const { url, client } = await fixture("fresh");
    await migrate(url);
    const history = await client.query("SELECT * FROM schema_migrations ORDER BY version");
    assert.deepEqual(history.rows.map((row) => row.version), migrations);
    for (const table of ["sessions", "hands", "users", "oauth_identities", "auth_tokens", "session_stats", "auth_rate_limits"]) {
      assert.equal((await client.query("SELECT to_regclass($1) AS name", [`public.${table}`])).rows[0].name, table);
    }
    await migrate(url);
    assert.deepEqual((await client.query("SELECT * FROM schema_migrations ORDER BY version")).rows, history.rows);
  });

  await t.test("old initialization-only database upgrades without losing gameplay", async () => {
    const { url, client } = await fixture("legacy");
    await client.query(await fs.readFile(path.join(sourceDirectory, migrations[0]), "utf8"));
    await client.query("INSERT INTO sessions (id, user_agent) VALUES ('legacy-session', 'legacy-test')");
    const { rows: [hand] } = await client.query(`
      INSERT INTO hands (session_id, round_index, hand_index, bet_cents, outcome,
        payout_cents, player_cards, dealer_cards)
      VALUES ('legacy-session', 1, 0, 100, 'win', 100, '[]', '[]') RETURNING id
    `);
    await migrate(url);
    assert.equal((await client.query("SELECT user_agent FROM sessions WHERE id = 'legacy-session'")).rows[0].user_agent, "legacy-test");
    assert.equal((await client.query("SELECT session_id FROM hands WHERE id = $1", [hand.id])).rows[0].session_id, "legacy-session");
    assert.equal((await client.query("SELECT count(*)::int AS count FROM schema_migrations")).rows[0].count, migrations.length);
  });

  await t.test("partially migrated database applies only its pending files", async () => {
    const { url, client } = await fixture("partial");
    const directory = await migrationCopy();
    for (const filename of migrations.slice(2)) await fs.unlink(path.join(directory, filename));
    await migrate(url, directory);
    const history = (await client.query("SELECT * FROM schema_migrations ORDER BY version")).rows;
    await client.query("INSERT INTO sessions (id) VALUES ('partial-session')");
    await migrate(url);
    assert.deepEqual((await client.query("SELECT * FROM schema_migrations ORDER BY version LIMIT 2")).rows, history);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM sessions")).rows[0].count, 1);
  });

  await t.test("concurrent migration runners record each version once", async () => {
    const { url, client } = await fixture("concurrent");
    await Promise.all([migrate(url), migrate(url)]);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM schema_migrations")).rows[0].count, migrations.length);
  });

  await t.test("failed SQL rolls back both schema changes and migration history", async () => {
    const { url, client } = await fixture("rollback");
    await migrate(url);
    const directory = await migrationCopy();
    const filename = "005_transaction_test.sql";
    await fs.writeFile(path.join(directory, filename), "CREATE TABLE rollback_probe (id integer); SELECT definitely_missing_column;\n");
    await assert.rejects(migrate(url, directory), (error) => error.stderr.includes("Migration failed"));
    assert.equal((await client.query("SELECT to_regclass('public.rollback_probe') AS name")).rows[0].name, null);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM schema_migrations WHERE version = $1", [filename])).rows[0].count, 0);
    await fs.writeFile(path.join(directory, filename), "CREATE TABLE rollback_probe (id integer);\n");
    await migrate(url, directory);
    assert.equal((await client.query("SELECT to_regclass('public.rollback_probe') AS name")).rows[0].name, "rollback_probe");
  });

  await t.test("modified and missing applied files fail before pending SQL runs", async () => {
    const { url, client } = await fixture("immutable");
    await migrate(url);
    const directory = await migrationCopy();
    await fs.writeFile(path.join(directory, "005_must_not_run.sql"), "CREATE TABLE must_not_run (id integer);\n");
    const original = await fs.readFile(path.join(directory, migrations[0]), "utf8");
    await fs.appendFile(path.join(directory, migrations[0]), "\n-- modified\n");
    await assert.rejects(migrate(url, directory), (error) => error.stderr.includes("was changed after it was applied"));
    assert.equal((await client.query("SELECT to_regclass('public.must_not_run') AS name")).rows[0].name, null);
    await fs.writeFile(path.join(directory, migrations[0]), original);
    await fs.unlink(path.join(directory, migrations[0]));
    await assert.rejects(migrate(url, directory), (error) => error.stderr.includes("is missing from the repository"));
    assert.equal((await client.query("SELECT to_regclass('public.must_not_run') AS name")).rows[0].name, null);
  });

  await t.test("backdated migrations are rejected before changing existing databases", async () => {
    const { url, client } = await fixture("backdated");
    await migrate(url);
    const directory = await migrationCopy();
    await fs.writeFile(path.join(directory, "000_backdated.sql"), "CREATE TABLE backdated_probe (id integer);\n");
    await assert.rejects(migrate(url, directory), (error) => error.stderr.includes("is out of order"));
    assert.equal((await client.query("SELECT to_regclass('public.backdated_probe') AS name")).rows[0].name, null);
  });

  await t.test("duplicate migration versions are rejected before connecting", async () => {
    const directory = await migrationCopy();
    await fs.writeFile(path.join(directory, "001_duplicate.sql"), "SELECT 1;\n");
    await assert.rejects(migrate(adminUrl, directory), (error) => error.stderr.includes("Duplicate migration sequence"));
  });

  await t.test("API role supports gameplay writes and sequence IDs but rejects DDL and history access", async () => {
    const { name, url, client } = await fixture("role");
    await migrate(url);
    await client.query("GRANT CREATE ON SCHEMA public TO PUBLIC");
    await client.query("GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO PUBLIC");
    await client.query("GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO PUBLIC");
    const username = `blackjack_test_${runId}_api`;
    const password = crypto.randomBytes(32).toString("hex");
    await provisionDatabaseRole(client, { username, password });
    roles.push(username);
    await provisionDatabaseRole(client, { username, password });

    const runtime = await connect(databaseUrl(name, username, password));
    clients.push(runtime);
    const { rows: [flags] } = await runtime.query(`
      SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
      FROM pg_roles WHERE rolname = current_user
    `);
    assert.equal(Object.values(flags).some(Boolean), false);
    await runtime.query("INSERT INTO sessions (id) VALUES ('api-role-session')");
    const { rows: [hand] } = await runtime.query(`
      INSERT INTO hands (session_id, round_index, hand_index, bet_cents, outcome,
        payout_cents, player_cards, dealer_cards)
      VALUES ('api-role-session', 1, 0, 100, 'win', 100, '[]', '[]') RETURNING id
    `);
    assert.ok(hand.id);
    assert.equal((await runtime.query("SELECT count(*)::int AS count FROM hands")).rows[0].count, 1);
    await runtime.query("UPDATE sessions SET user_agent = 'role-test' WHERE id = 'api-role-session'");
    await runtime.query("DELETE FROM hands WHERE id = $1", [hand.id]);

    for (const sql of [
      "CREATE TABLE public.forbidden (id integer)",
      "CREATE TEMP TABLE forbidden_temp (id integer)",
      "CREATE SCHEMA forbidden_schema",
      "ALTER TABLE public.sessions ADD COLUMN forbidden integer",
      "DROP TABLE public.hands",
      "TRUNCATE public.sessions CASCADE",
      "SELECT * FROM public.schema_migrations",
      "INSERT INTO public.schema_migrations (version, checksum) VALUES ('forbidden', 'forbidden')",
      "UPDATE public.schema_migrations SET checksum = 'forbidden'",
      "DELETE FROM public.schema_migrations",
      "CREATE ROLE forbidden_role",
    ]) {
      await assert.rejects(runtime.query(sql), (error) => error.code === "42501", sql);
    }
    await assert.rejects(migrate(databaseUrl(name, username, password)), (error) => error.stderr.includes("permission denied"));
    assert.equal((await client.query("SELECT count(*)::int AS count FROM schema_migrations")).rows[0].count, migrations.length);
  });

  await t.test("provisioning refuses to repurpose the administrator", async () => {
    const { url, client } = await fixture("admin_guard");
    await migrate(url);
    const { rows: [row] } = await client.query("SELECT current_user AS username");
    await assert.rejects(provisionDatabaseRole(client, {
      username: row.username, password: "must-not-change-admin-password",
    }), /must be different/);
    assert.equal((await client.query("SELECT rolsuper FROM pg_roles WHERE rolname = current_user")).rows[0].rolsuper, true);
  });

  await t.test("a failed grant rolls back role creation", async () => {
    const { client } = await fixture("role_rollback");
    const username = `blackjack_test_${runId}_rollback`;
    await assert.rejects(provisionDatabaseRole(client, {
      username, password: "long-throwaway-test-role-password",
    }));
    assert.equal((await administrator.query("SELECT count(*)::int AS count FROM pg_roles WHERE rolname = $1", [username])).rows[0].count, 0);
  });

  await t.test("existing privileged roles, memberships, and ownership are refused", async () => {
    const { url, client } = await fixture("existing_role_guard");
    await migrate(url);
    for (const kind of ["privileged", "member", "owner"]) {
      const username = `blackjack_test_${runId}_${kind}`;
      const role = administrator.escapeIdentifier(username);
      await administrator.query(`CREATE ROLE ${role} NOLOGIN ${kind === "privileged" ? "CREATEROLE" : ""}`);
      roles.push(username);
      if (kind === "member") {
        const { rows: [row] } = await administrator.query("SELECT current_user AS username");
        await administrator.query(`GRANT ${administrator.escapeIdentifier(row.username)} TO ${role}`);
      }
      if (kind === "owner") {
        await client.query("CREATE TABLE public.owner_probe (id integer)");
        await client.query(`ALTER TABLE public.owner_probe OWNER TO ${role}`);
      }
      await assert.rejects(provisionDatabaseRole(client, {
        username, password: "must-not-change-existing-role-password",
      }), /Refusing to repurpose/);
      assert.equal((await administrator.query("SELECT rolcanlogin FROM pg_roles WHERE rolname = $1", [username])).rows[0].rolcanlogin, false);
    }
  });
});

if (!adminUrl) {
  console.error("Set DATABASE_TEST_ADMIN_URL to an isolated PostgreSQL administrator connection to run database integration tests");
  process.exitCode = 1;
}
