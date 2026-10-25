FROM docker.io/library/postgres:16.15-alpine3.24

# Alpine's su-exec is a small C utility equivalent for the entrypoint's
# privilege-drop use of gosu. Replacing the bundled Go binary removes its
# vulnerable Go standard library from the runtime image.
RUN apk add --no-cache su-exec \
    && rm /usr/local/bin/gosu \
    && ln -s /sbin/su-exec /usr/local/bin/gosu
