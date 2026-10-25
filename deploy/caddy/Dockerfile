FROM docker.io/library/golang:1.26.10-alpine AS caddy-build

RUN go install github.com/caddyserver/xcaddy/cmd/xcaddy@v0.4.7 \
    && xcaddy build v2.11.7 \
        --replace golang.org/x/net@v0.59.0=golang.org/x/net@v0.60.0 \
        --output /usr/bin/caddy

FROM docker.io/library/caddy:2.11.7-alpine

# Keep the runtime Brotli library on the patched Alpine package release.
RUN apk upgrade --no-cache brotli-libs

COPY --from=caddy-build /usr/bin/caddy /usr/bin/caddy
