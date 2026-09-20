#!/usr/bin/env bash
set -Eeuo pipefail

# Run pending database migrations without allocating an interactive TTY.
podman-compose run --rm -T api npm run migrate
