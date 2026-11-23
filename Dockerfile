# syntax=docker/dockerfile:1.29
##
# Send
#
# License https://gitlab.com/timvisee/send/blob/master/LICENSE
#
# Two stages: `build` compiles everything, the runtime stage only receives the
# result. The server is bundled into a single file by esbuild, so the runtime
# needs no node_modules, no npm and no shell.
#
#   docker build -t send .                 # default: FROM scratch (smallest)
#   docker build -t send:slim --target slim .   # official node slim base
##

# renovate: datasource=docker depName=node
ARG NODE_VERSION=26.13.1
ARG NODE_IMAGE=node:${NODE_VERSION}-trixie-slim

################################################################################
FROM ${NODE_IMAGE} AS build

WORKDIR /src

# Dependencies first, for the layer cache. npm >= 11 runs no install scripts
# unless they are allowed, and none are needed to build.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

COPY . .

ARG GIT_COMMIT=
ARG VERSION_TAG=
ENV GIT_COMMIT=${GIT_COMMIT} VERSION_TAG=${VERSION_TAG}
RUN npm run build \
 && rm -f dist/*.map

# The root filesystem of the scratch image: node, the shared libraries it
# links against, the application, and an unprivileged user.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    set -eux; \
    rm -f /etc/apt/apt.conf.d/docker-clean; \
    apt-get update; \
    apt-get install -y --no-install-recommends binutils; \
    mkdir -p /rootfs/usr/local/bin /rootfs/etc /rootfs/app/public /rootfs/app/uploads /rootfs/tmp; \
    # the symbol table is only useful to debuggers: -33MB, and there are no
    # native addons that would need more than the dynamic symbols that stay
    strip --strip-unneeded -o /rootfs/usr/local/bin/node /usr/local/bin/node; \
    for lib in $(ldd /usr/local/bin/node | grep -o '/[^ ]*'); do \
      cp -L --parents "$lib" /rootfs/; \
    done; \
    echo 'send:x:10001:10001:send:/tmp:/sbin/nologin' > /rootfs/etc/passwd; \
    echo 'send:x:10001:' > /rootfs/etc/group; \
    cp -r dist dist-server /rootfs/app/; \
    cp -r public/locales /rootfs/app/public/; \
    chown 10001:10001 /rootfs/app/uploads /rootfs/tmp; \
    chmod 1777 /rootfs/tmp; \
    # node must start from the copied libraries alone
    chroot /rootfs /usr/local/bin/node -e 'process.exit(0)'

################################################################################
# Runtime on the official node slim image
FROM ${NODE_IMAGE} AS slim

ENV NODE_ENV=production \
    PORT=1443 \
    FILE_DIR=/app/uploads \
    SEND_ROOT=/app

WORKDIR /app
COPY --from=build --chown=root:root /rootfs/app/ /app/
RUN mkdir -p /app/uploads && chown node:node /app/uploads \
 # nothing in the image needs npm or yarn at runtime
 && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx \
           /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg

USER node
EXPOSE 1443
VOLUME ["/app/uploads"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||1443)+'/__lbheartbeat__').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["node", "--enable-source-maps", "/app/dist-server/server.js"]

################################################################################
# Runtime from scratch (default): nothing but node and the application
FROM scratch AS runtime

COPY --from=build /rootfs/ /

ENV NODE_ENV=production \
    PORT=1443 \
    FILE_DIR=/app/uploads \
    SEND_ROOT=/app \
    HOME=/tmp

WORKDIR /app
USER 10001:10001
EXPOSE 1443
VOLUME ["/app/uploads"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["/usr/local/bin/node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||1443)+'/__lbheartbeat__').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["/usr/local/bin/node", "--enable-source-maps", "/app/dist-server/server.js"]
