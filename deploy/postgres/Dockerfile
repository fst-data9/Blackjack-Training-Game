FROM docker.io/library/postgres:18.4-alpine3.24

# Alpine's su-exec safely drops privileges for the official entrypoint without
# shipping the vulnerable Go-based gosu binary.
RUN apk add --no-cache su-exec \
    && sed -i 's/exec gosu postgres/exec su-exec postgres/' /usr/local/bin/docker-entrypoint.sh \
    && rm /usr/local/bin/gosu
