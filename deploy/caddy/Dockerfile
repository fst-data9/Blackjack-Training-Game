FROM docker.io/library/golang:1.27.3-alpine AS caddy-build

# CVE-2026-116587: v3 has no tagged fix yet; pin the upstream security
# backport (go-jose/go-jose#314). v4 is fixed in the released v4.1.6.
RUN go install github.com/caddyserver/xcaddy/cmd/xcaddy@v0.4.7 \
    && xcaddy build v2.11.7 \
        --replace golang.org/x/net@v0.59.0=golang.org/x/net@v0.60.0 \
        --replace github.com/go-jose/go-jose/v3@v3.0.5=github.com/go-jose/go-jose/v3@v3.0.6-0.20261030183946-0e502b87c7aa \
        --replace github.com/go-jose/go-jose/v4@v4.1.5=github.com/go-jose/go-jose/v4@v4.1.6 \
        --output /usr/bin/caddy

FROM docker.io/library/caddy:2.11.8-alpine

# The upstream image includes curl for convenience, but Caddy does not need it
# at runtime. Remove curl and libcurl to keep vulnerable, unused packages out.
# Keep the runtime Brotli library on the patched Alpine package release.
RUN apk del curl libcurl \
    && apk upgrade --no-cache brotli-libs

COPY --from=caddy-build /usr/bin/caddy /usr/bin/caddy
