#!/usr/bin/env bash
set -Eeuo pipefail

restore_script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$restore_script_dir/database-backup-common.sh"

if [[ $# -ne 1 || ! -r "$1" || ! -s "$1" ]]; then
  echo "Usage: bash scripts/database-restore-test.sh /absolute/path/to/backup.dump.age" >&2
  exit 1
fi
encrypted_backup="$1"
: "${AGE_IDENTITY_FILE:?Set AGE_IDENTITY_FILE to the private age key file}"
if [[ ! -r "$AGE_IDENTITY_FILE" ]]; then
  echo "Private age key file is not readable" >&2
  exit 1
fi
if [[ -n "${RESTORE_VERIFY_SQL:-}" && ! -r "$RESTORE_VERIFY_SQL" ]]; then
  echo "RESTORE_VERIFY_SQL is not readable" >&2
  exit 1
fi

restore_marker="$(mktemp /tmp/blackjack-restore-check.XXXXXX)"
restore_suffix="${restore_marker##*.}"
restore_database="blackjack_restore_${backup_environment}_$(date -u +%Y%m%dT%H%M%SZ)_$restore_suffix"
restore_created=false

function cleanup_restore() {
  restore_exit_code=$?
  trap - EXIT
  if [[ "$restore_created" == true ]]; then
    if postgres_command '
      exec dropdb --no-password --username="$POSTGRES_USER" --maintenance-db="$POSTGRES_DB" "$1"
    ' "$restore_database"; then
      echo "Removed temporary restore database: $restore_database"
    else
      echo "Cleanup failed; remove only this temporary database: $restore_database" >&2
      if [[ "$restore_exit_code" == 0 ]]; then restore_exit_code=1; fi
    fi
  fi
  rm -f -- "$restore_marker"
  exit "$restore_exit_code"
}
trap cleanup_restore EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# The target is always a newly created, generated test database. No caller can
# supply the live database name, and a failed CREATE never triggers a DROP.
postgres_command '
  exec createdb --no-password --username="$POSTGRES_USER" --maintenance-db="$POSTGRES_DB" \
    --template=template0 "$1"
' "$restore_database"
restore_created=true

age --decrypt --identity "$AGE_IDENTITY_FILE" "$encrypted_backup" |
  postgres_command '
    exec pg_restore --no-password --username="$POSTGRES_USER" --dbname="$1" \
      --exit-on-error --single-transaction --no-owner --no-acl
  ' "$restore_database"

postgres_command '
  exec psql -X --no-password --username="$POSTGRES_USER" --dbname="$1" --set=ON_ERROR_STOP=1
' "$restore_database" < "$restore_script_dir/../database/verify-restore.sql"

if [[ -n "${RESTORE_VERIFY_SQL:-}" ]]; then
  postgres_command '
    exec psql -X --no-password --username="$POSTGRES_USER" --dbname="$1" --set=ON_ERROR_STOP=1
  ' "$restore_database" < "$RESTORE_VERIFY_SQL"
fi
echo "Restore verification passed for $backup_environment"
