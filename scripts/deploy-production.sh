#!/usr/bin/env bash
set -Eeuo pipefail

readonly expected_branch="main"
readonly health_url="${PRODUCTION_HEALTH_URL:-https://blackjack-trainer.co/api/health}"

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if [[ "$(git branch --show-current)" != "$expected_branch" ]]; then
  echo "Refusing to deploy: checkout '$expected_branch' first." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to deploy: working tree is not clean." >&2
  exit 1
fi

readonly compose=(
  docker compose
  -f docker-compose.yml
  -f deploy/production/docker-compose.yml
)

echo "Updating $expected_branch..."
git pull --ff-only origin "$expected_branch"

echo "Building the API image..."
"${compose[@]}" build api

echo "Running database migrations..."
"${compose[@]}" run --rm api npm run migrate

echo "Starting production services..."
"${compose[@]}" --profile production up -d

echo "Service status:"
"${compose[@]}" ps

echo "Checking $health_url..."
curl --fail --silent --show-error "$health_url"
echo
echo "Production deployment completed."
