import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: fileURLToPath(new URL(".env.migrations", import.meta.url)) });

// Explicitly exclude schema_migrations. Update this list when an API migration
// introduces a new application table, then re-run db:prepare on release.
const applicationTables = [
  "sessions", "hands", "users", "oauth_identities", "auth_tokens",
  "session_stats", "auth_rate_limits",
];

export async function provisionDatabaseRole(client, { username, password }) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(username || "")) {
    throw new Error("DATABASE_APP_USER must be a lowercase PostgreSQL role name (up to 63 characters)");
  }
  if (typeof password !== "string" || password.length < 24 || password.includes("\0")) {
    throw new Error("DATABASE_APP_PASSWORD must contain at least 24 characters and no NUL bytes");
  }

  const { rows: [database] } = await client.query(`
    SELECT current_user AS administrator, current_database() AS name
  `);
  if (username === database.administrator) {
    throw new Error("The API role must be different from the migration/administrator role");
  }

  const role = client.escapeIdentifier(username);
  const databaseName = client.escapeIdentifier(database.name);

  await client.query("BEGIN");
  try {
    // Serialize provisioning as well as migrations; role passwords and grants
    // are changed together, or not at all.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["blackjack-training-game:roles"]);
    const { rows: [existing] } = await client.query(`
      SELECT oid, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
      FROM pg_roles WHERE rolname = $1
    `, [username]);

    if (existing) {
      if ([existing.rolsuper, existing.rolcreatedb, existing.rolcreaterole,
        existing.rolreplication, existing.rolbypassrls].some(Boolean)) {
        throw new Error("Refusing to repurpose a privileged role; choose a new DATABASE_APP_USER");
      }
      const { rows: [dependencies] } = await client.query(`
        SELECT
          EXISTS (SELECT 1 FROM pg_auth_members WHERE member = $1) AS memberships,
          EXISTS (SELECT 1 FROM pg_shdepend
            WHERE refclassid = 'pg_authid'::regclass AND refobjid = $1 AND deptype = 'o') AS ownership
      `, [existing.oid]);
      if (dependencies.memberships || dependencies.ownership) {
        throw new Error("Refusing to repurpose a role with memberships or owned objects; choose a new DATABASE_APP_USER");
      }
    } else {
      await client.query(`CREATE ROLE ${role} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
    }

    await client.query(`ALTER ROLE ${role} LOGIN NOINHERIT PASSWORD ${client.escapeLiteral(password)}`);
    await client.query(`REVOKE ALL PRIVILEGES ON DATABASE ${databaseName} FROM ${role}`);
    await client.query(`REVOKE CREATE, TEMPORARY ON DATABASE ${databaseName} FROM PUBLIC`);
    await client.query(`GRANT CONNECT ON DATABASE ${databaseName} TO ${role}`);
    await client.query(`REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${role}`);
    await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await client.query(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${role}`);
    await client.query(`REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${role}`);
    // PUBLIC grants also apply to this role, even with NOINHERIT. Remove them
    // in this application's dedicated database, including legacy broad grants.
    await client.query("REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC");
    await client.query("REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC");
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      ${applicationTables.map((table) => `public.${client.escapeIdentifier(table)}`).join(", ")}
      TO ${role}`);
    await client.query(`GRANT USAGE ON SEQUENCE public.hands_id_seq TO ${role}`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required in the migration environment");
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 5_000),
    query_timeout: Number(process.env.DB_QUERY_TIMEOUT_MS || 65_000),
    statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 60_000),
    application_name: "blackjack-role-provisioning",
  });
  try {
    await client.connect();
    await provisionDatabaseRole(client, {
      username: process.env.DATABASE_APP_USER,
      password: process.env.DATABASE_APP_PASSWORD,
    });
    console.log("API database role provisioned with application data privileges only");
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Database role provisioning failed:", error.message);
    process.exitCode = 1;
  });
}
