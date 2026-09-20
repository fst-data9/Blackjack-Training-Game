import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;
const migrationDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  process.env.MIGRATIONS_DIR || "../database/init"
);
const migrationNamePattern = /^(\d{3})_[a-z0-9_]+\.sql$/;
const lockName = "blackjack-training-game:migrations";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 5_000),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30_000),
  query_timeout: Number(process.env.DB_QUERY_TIMEOUT_MS || 6_000),
  statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 5_000),
  application_name: "blackjack-migrations",
});

function checksum(contents) {
  return crypto.createHash("sha256").update(contents).digest("hex");
}

async function loadMigrations() {
  const entries = await fs.readdir(migrationDirectory, { withFileTypes: true });
  const filenames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  if (filenames.length === 0) {
    throw new Error(`No SQL migrations found in ${migrationDirectory}`);
  }

  const sequenceNumbers = new Set();
  const migrations = [];

  for (const filename of filenames) {
    const match = migrationNamePattern.exec(filename);
    if (!match) {
      throw new Error(
        `Invalid migration filename "${filename}". Expected a name such as 005_example.sql`
      );
    }
    const sequenceNumber = Number(match[1]);
    if (sequenceNumbers.has(sequenceNumber)) {
      throw new Error(`Duplicate migration sequence ${match[1]}`);
    }
    sequenceNumbers.add(sequenceNumber);

    const sql = await fs.readFile(path.join(migrationDirectory, filename), "utf8");
    if (!sql.trim()) throw new Error(`Migration ${filename} is empty`);
    migrations.push({ filename, sql, checksum: checksum(sql) });
  }

  return migrations;
}

async function runMigrations() {
  const migrations = await loadMigrations();

  if (process.argv.includes("--check")) {
    console.log(`Validated ${migrations.length} migration files in ${migrationDirectory}`);
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to run database migrations");
  }

  const client = await pool.connect();
  let lockHeld = false;

  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [lockName]);
    lockHeld = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const appliedResult = await client.query(
      "SELECT version, checksum FROM schema_migrations ORDER BY version"
    );
    const applied = new Map(appliedResult.rows.map((row) => [row.version, row.checksum]));
    const knownVersions = new Set(migrations.map((migration) => migration.filename));

    for (const version of applied.keys()) {
      if (!knownVersions.has(version)) {
        throw new Error(`Applied migration ${version} is missing from the repository`);
      }
    }

    for (const migration of migrations) {
      const recordedChecksum = applied.get(migration.filename);
      if (recordedChecksum) {
        if (recordedChecksum !== migration.checksum) {
          throw new Error(
            `Migration ${migration.filename} was changed after it was applied. ` +
            "Create a new migration instead of editing an applied migration."
          );
        }
        console.log(`Already applied: ${migration.filename}`);
        continue;
      }

      console.log(`Applying: ${migration.filename}`);
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)",
          [migration.filename, migration.checksum]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log("Database migrations are up to date");
  } finally {
    try {
      if (lockHeld) {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockName]);
      }
    } finally {
      client.release();
    }
  }
}

try {
  await runMigrations();
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
