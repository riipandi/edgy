# syntax=docker/dockerfile:1.7

# Arguments with default value (for build).
ARG DISTROLESS_TAG=nonroot
ARG PLATFORM=linux/amd64
ARG NODE_VERSION=24

# ------------------------------------------------------------------------------
# Base image (https://viteplus.dev/guide/docker)
# ------------------------------------------------------------------------------
FROM --platform=${PLATFORM} ghcr.io/voidzero-dev/vite-plus:latest AS base
ENV DO_NOT_TRACK=1 CI=true LEFTHOOK=0 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=true
ENV VP_NODE_MANAGER=yes VP_PM_MANAGER=yes VP_HOME=/home/vp/.vite-plus PNPM_HOME=/pnpm
ENV PATH="/home/vp/.vite-plus/bin:$PNPM_HOME:$PATH"

# Add tini for signal handling and zombie reaping
RUN set -eux; \
    TINI_DOWNLOAD_URL="https://github.com/krallin/tini/releases/download/v0.19.0" \
    ARCH="$(dpkg --print-architecture)"; \
    case "${ARCH}" in \
      amd64|x86_64) TINI_BIN_URL="${TINI_DOWNLOAD_URL}/tini" ;; \
      arm64|aarch64) TINI_BIN_URL="${TINI_DOWNLOAD_URL}/tini-arm64" ;; \
      *) echo "unsupported architecture: ${ARCH}"; exit 1 ;; \
    esac; \
    curl -fsSL "${TINI_BIN_URL}" -o /tmp/tini; \
    chmod +x /tmp/tini

WORKDIR /app

# ------------------------------------------------------------------------------
# Install dependencies and build the application.
# ------------------------------------------------------------------------------
FROM base AS builder

# Install dependencies first so this layer is cached across source changes.
COPY --chown=vp:vp package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store vp install --frozen-lockfile \
    --ignore-scripts

# Vite+ will provisions that exact Node.js automatically.
COPY --chown=vp:vp . .
ENV ENV_BINARY_PATH=/busybox/env NODE_ENV=production
RUN --mount=type=cache,id=pnpm,target=/pnpm/store vp build --mode standalone --minify

# ------------------------------------------------------------------------------
# Cleanup the builder stage and create data directory.
# ------------------------------------------------------------------------------
FROM base AS pruner

# Copy only necessary files from builder stage
COPY --from=builder /app/dist /app

# Create necessary directories and set permissions the entry.js file.
RUN mkdir -p /app/storage/{backup,certs,data,logs,uploads} \
    && chmod -R 0775 /app/storage \
    && chmod +x /app/entry.js

# ------------------------------------------------------------------------------
# Production image, copy build output files and run the application.
# ------------------------------------------------------------------------------
FROM --platform=${PLATFORM} gcr.io/distroless/nodejs${NODE_VERSION}-debian13:${DISTROLESS_TAG}

# Copy the build output files and necessary system utilities from previous stage.
# To enhance security, consider avoiding the copying of sysutils.
COPY --chown=nonroot:nonroot --from=pruner /app /app
COPY --from=base /tmp/tini /usr/bin/tini

# @ref: https://www.akamas.io/resources/tuning-nodejs-v8-performance-efficiency
ENV NODE_OPTIONS="--max-old-space-size=2048"
ENV NODE_OPTIONS=$NODE_OPTIONS NODE_ENV=production

# Define the host and port to listen on.
# Prevent load certs from system (/etc/ssl/certs/ca-certificates.crt)
ENV PATH="/usr/bin:/usr/local/bin:/busybox:/nodejs/bin:$PATH"
ARG HOST=0.0.0.0 PORT=3000 TZ=UTC
ENV HOST=$HOST PORT=$PORT TZ=$TZ
ENV SSL_CERT_FILE= SSL_CERT_DIR=
ENV TINI_SUBREAPER=true

WORKDIR /app
VOLUME /app/storage
USER nonroot:nonroot
EXPOSE $PORT/tcp

# Healthcheck to monitor application status
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD /app/entry.js healthcheck

# SHELL: /busybox/sh
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/entry.js", "serve", "--auto-migrate"]
