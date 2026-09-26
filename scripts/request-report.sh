#!/usr/bin/env bash
set -Eeuo pipefail

readonly container="${CADDY_CONTAINER:-blackjack-caddy}"
readonly since="${1:-24h}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required; install it with: sudo apt install jq" >&2
  exit 1
fi

docker logs --since "$since" "$container" 2>&1 |
  jq -R -s --arg since "$since" '
    [split("\n")[] | try fromjson catch empty | select(.request != null)] as $rows |
    {
      period: $since,
      requests: ($rows | length),
      unique_clients: (
        $rows
        | map(.request.remote_ip // "unknown")
        | unique
        | length
      ),
      status_codes: (
        $rows
        | group_by(.status // 0)
        | map({(.[0].status | tostring): length})
        | add // {}
      ),
      paths: (
        $rows
        | map(.request.uri // "unknown" | split("?")[0])
        | group_by(.)
        | map({path: .[0], requests: length})
        | sort_by(-.requests)
        | .[0:20]
      )
    }
  '
