#!/usr/bin/env bash
set -Eeuo pipefail

backup_script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$backup_script_dir/database-backup-common.sh"

: "${BACKUP_RECIPIENT:?Set BACKUP_RECIPIENT to an age public key}"
retention_days="${BACKUP_RETENTION_DAYS:-30}"
if [[ ! "$retention_days" =~ ^[1-9][0-9]{0,3}$ ]]; then
  echo "BACKUP_RETENTION_DAYS must be a positive number of days (up to 9999)" >&2
  exit 1
fi
for required_command in flock realpath find mktemp; do
  command -v "$required_command" >/dev/null || { echo "Required command not found: $required_command" >&2; exit 1; }
done

backup_dir="${BACKUP_DIR:-/var/backups/blackjack/$backup_environment}"
if [[ "$backup_dir" != /* ]]; then
  echo "BACKUP_DIR must be absolute" >&2
  exit 1
fi
backup_dir="$(realpath -m -- "$backup_dir")"
# Limit automatic pruning to a dedicated application/environment directory.
if [[ "$(basename -- "$backup_dir")" != "$backup_environment" ||
      "$(basename -- "$(dirname -- "$backup_dir")")" != blackjack ]]; then
  echo "BACKUP_DIR must end in /blackjack/$backup_environment" >&2
  exit 1
fi

mkdir -p -- "$backup_dir"
chmod 700 -- "$backup_dir"
exec 9> "$backup_dir/.backup.lock"
flock -n 9 || { echo "Another backup is already running for $backup_environment" >&2; exit 1; }

backup_timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
temporary_backup="$(mktemp "$backup_dir/.blackjack-$backup_environment-$backup_timestamp.XXXXXX")"
function cleanup_backup() {
  if [[ -n "$temporary_backup" ]]; then rm -f -- "$temporary_backup"; fi
}
trap cleanup_backup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# pipefail means a failed pg_dump cannot publish a valid-looking encrypted file.
# No plaintext dump is written to disk and no password is passed on the host CLI.
postgres_command '
  exec pg_dump --no-password --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
    --format=custom --no-owner --no-acl --lock-wait-timeout=30s
' | age --encrypt --recipient "$BACKUP_RECIPIENT" > "$temporary_backup"

backup_suffix="${temporary_backup##*.}"
published_backup="$backup_dir/blackjack-$backup_environment-$backup_timestamp-$backup_suffix.dump.age"
mv -n -- "$temporary_backup" "$published_backup"
if [[ -e "$temporary_backup" ]]; then
  echo "Refusing to overwrite an existing backup" >&2
  exit 1
fi
temporary_backup=""
echo "Encrypted backup created: $published_backup"

# Prune only regular files with this job's exact filename format, and only
# after a new backup succeeds. Other files/environments are left untouched.
find "$backup_dir" -maxdepth 1 -type f -mtime "+$retention_days" -print0 |
while IFS= read -r -d '' expired_backup; do
  expired_name="${expired_backup##*/}"
  if [[ "$expired_name" =~ ^blackjack-$backup_environment-[0-9]{8}T[0-9]{6}Z-[a-zA-Z0-9]{6}\.dump\.age$ ]]; then
    rm -- "$expired_backup"
    echo "Removed expired local backup: $expired_name"
  fi
done
