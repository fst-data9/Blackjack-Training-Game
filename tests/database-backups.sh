#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

test_repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
test_engine="${CONTAINER_ENGINE:-docker}"
: "${BACKUP_TEST_POSTGRES_CONTAINER:?Set BACKUP_TEST_POSTGRES_CONTAINER to an isolated labeled test container}"

test_label="$("$test_engine" inspect --format '{{ index .Config.Labels "com.blackjack.backup-test" }}' "$BACKUP_TEST_POSTGRES_CONTAINER")"
if [[ "$test_label" != true ]]; then
  echo "Refusing to seed an unlabeled database container. Set com.blackjack.backup-test=true on the isolated test container." >&2
  exit 1
fi
for required_command in age age-keygen flock sha256sum; do
  command -v "$required_command" >/dev/null || { echo "Missing command: $required_command" >&2; exit 1; }
done

test_root="$(mktemp -d /tmp/blackjack-backup-tests.XXXXXX)"
trap 'rm -rf -- "$test_root"' EXIT
test_count=0
function passed() { test_count=$((test_count + 1)); echo "PASS: $1"; }
function test_sql() {
  "$test_engine" exec -i "$BACKUP_TEST_POSTGRES_CONTAINER" sh -c '
    exec psql -X --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --set=ON_ERROR_STOP=1 "$@"
  ' sh "$@"
}
function must_fail() {
  if "$@" > "$test_root/expected-failure.log" 2>&1; then
    echo "Expected command to fail: $1" >&2
    exit 1
  fi
}
function no_restore_databases() {
  [[ "$(test_sql -At -c "SELECT count(*) FROM pg_database WHERE datname LIKE 'blackjack_restore_%'")" == 0 ]]
}

# Only seed a fresh, explicitly labeled test service. Production containers are
# never selected implicitly and no live source database is reset or dropped.
[[ "$(test_sql -At -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")" == 0 ]]
for migration in "$test_repo_root"/database/init/*.sql; do test_sql < "$migration" > /dev/null; done
test_sql -c 'CREATE TABLE schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())' > /dev/null
for migration in "$test_repo_root"/database/init/*.sql; do
  filename="${migration##*/}"
  [[ "$filename" =~ ^[0-9]{3}_[a-z0-9_]+\.sql$ ]]
  migration_hash="$(sha256sum "$migration")"
  migration_hash="${migration_hash%% *}"
  test_sql -c "INSERT INTO schema_migrations (version, checksum) VALUES ('$filename', '$migration_hash')" > /dev/null
done
test_sql < "$test_repo_root/tests/fixtures/backup-data.sql" > /dev/null

age-keygen -o "$test_root/fixture.backup.key" 2> /dev/null
export BACKUP_ENVIRONMENT=test
export CONTAINER_ENGINE="$test_engine"
export POSTGRES_CONTAINER="$BACKUP_TEST_POSTGRES_CONTAINER"
export BACKUP_DIR="$test_root/blackjack/test"
export BACKUP_RECIPIENT="$(age-keygen -y "$test_root/fixture.backup.key")"
export BACKUP_RETENTION_DAYS=30
export AGE_IDENTITY_FILE="$test_root/fixture.backup.key"
export RESTORE_VERIFY_SQL="$test_root/verify-restored-data.sql"
cp "$test_repo_root/tests/fixtures/verify-backup-data.sql" "$RESTORE_VERIFY_SQL"
expected_history="$(test_sql -At -c 'SELECT jsonb_agg(to_jsonb(m) ORDER BY version) FROM schema_migrations m')"
printf '%s\n' "DO \$\$ BEGIN
  IF (SELECT jsonb_agg(to_jsonb(m) ORDER BY version) FROM schema_migrations m)
    IS DISTINCT FROM '$expected_history'::jsonb THEN
    RAISE EXCEPTION 'Migration history did not survive restoration';
  END IF;
END; \$\$;" >> "$RESTORE_VERIFY_SQL"

bash "$test_repo_root/scripts/database-backup.sh"
backups=("$BACKUP_DIR"/*.dump.age)
[[ "${#backups[@]}" == 1 ]]
encrypted_backup="${backups[0]}"
[[ "$(head -n 1 "$encrypted_backup")" == age-encryption.org/v1 ]]
[[ "$(stat -c %a "$encrypted_backup")" == 600 && "$(stat -c %a "$BACKUP_DIR")" == 700 ]]
[[ "$(find "$BACKUP_DIR" -maxdepth 1 -name '.blackjack-*' | wc -l)" == 0 ]]
passed "backup is encrypted, permissions are private, and no partial dump remains"

bash "$test_repo_root/scripts/database-restore-test.sh" "$encrypted_backup"
no_restore_databases
test_sql < "$test_repo_root/tests/fixtures/verify-backup-data.sql" > /dev/null
passed "full account/gameplay data restores and the source database is untouched"

age-keygen -o "$test_root/wrong.backup.key" 2> /dev/null
must_fail env AGE_IDENTITY_FILE="$test_root/wrong.backup.key" bash "$test_repo_root/scripts/database-restore-test.sh" "$encrypted_backup"
no_restore_databases
passed "wrong keys fail and temporary databases are cleaned up"

cp "$encrypted_backup" "$test_root/corrupted.dump.age"
truncate -s -1 "$test_root/corrupted.dump.age"
must_fail bash "$test_repo_root/scripts/database-restore-test.sh" "$test_root/corrupted.dump.age"
no_restore_databases
passed "corrupted ciphertext fails and temporary databases are cleaned up"

old_backup="$BACKUP_DIR/blackjack-test-20000101T000000Z-Abc123.dump.age"
other_environment="$BACKUP_DIR/blackjack-staging-20000101T000000Z-Abc123.dump.age"
unrelated_file="$BACKUP_DIR/operator-notes.txt"
touch -d '2000-01-01' "$old_backup" "$other_environment" "$unrelated_file"
printf '#!/bin/sh\nprintf "incomplete dump"\nexit 1\n' > "$test_root/failing-engine"
chmod 700 "$test_root/failing-engine"
must_fail env CONTAINER_ENGINE="$test_root/failing-engine" bash "$test_repo_root/scripts/database-backup.sh"
[[ -f "$old_backup" ]]
[[ "$(find "$BACKUP_DIR" -maxdepth 1 -name '.blackjack-*' | wc -l)" == 0 ]]
[[ "$(find "$BACKUP_DIR" -maxdepth 1 -name 'blackjack-test-*.dump.age' | wc -l)" == 2 ]]
passed "failed dump publishes nothing, removes its partial file, and preserves older backups"

(
  exec 9> "$BACKUP_DIR/.backup.lock"
  flock -n 9
  must_fail bash "$test_repo_root/scripts/database-backup.sh"
)
passed "overlapping backups are rejected"

bash "$test_repo_root/scripts/database-backup.sh"
[[ ! -e "$old_backup" && -f "$other_environment" && -f "$unrelated_file" && -f "$encrypted_backup" ]]
passed "retention removes only old files for this environment after a successful backup"

must_fail env BACKUP_DIR="$test_root" bash "$test_repo_root/scripts/database-backup.sh"
passed "broad backup/pruning directories are rejected"
echo "All $test_count encrypted backup/restore checks passed"
