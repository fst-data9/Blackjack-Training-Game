#!/usr/bin/env bash
set -Eeuo pipefail

# Apply migrations and refresh the API role using release-only credentials.
podman-compose run --rm -T migrate
