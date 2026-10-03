#!/usr/bin/env bash

# Shared by the backup and restore-check scripts. Secrets stay in the database
# container; host commands only need a container name and public encryption key.
set -Eeuo pipefail
umask 077

backup_environment="${BACKUP_ENVIRONMENT:?Set BACKUP_ENVIRONMENT to staging, production, or test}"
case "$backup_environment" in
  staging|production|test) ;;
  *) echo "Unsupported BACKUP_ENVIRONMENT" >&2; exit 1 ;;
esac

container_engine="${CONTAINER_ENGINE:-docker}"
postgres_container="${POSTGRES_CONTAINER:-blackjack-postgres}"
if [[ ! "$postgres_container" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$ ]]; then
  echo "Invalid POSTGRES_CONTAINER" >&2
  exit 1
fi
for required_command in "$container_engine" age; do
  command -v "$required_command" >/dev/null || {
    echo "Required command not found: $required_command" >&2
    exit 1
  }
done

function postgres_command() {
  "$container_engine" exec -i "$postgres_container" sh -c "$1" sh "${@:2}"
}
