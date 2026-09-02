#
# Builder - compile TypeScript and build Linux SEA binary
#
FROM node:22-alpine3.23 as builder

WORKDIR /opt/azurite

# Install dependencies first (cached across source-only changes)
COPY *.json LICENSE NOTICE.txt ./
RUN npm ci

# Copy source and build
COPY src ./src
COPY tests ./tests
COPY scripts ./scripts

RUN npm run build && npm run build:linux

#
# Production image - minimal image without npm, using SEA binary
#
FROM alpine:3.23

ENV NODE_ENV=production

WORKDIR /opt/azurite

# Node.js SEA binaries are linked against libstdc++; install the runtime
# libraries since this base (unlike node:22-alpine) doesn't include them.
RUN apk add --no-cache libstdc++ libgcc

# Default Workspace Volume
VOLUME [ "/data" ]

# Copy license and notice files for compliance
COPY --from=builder /opt/azurite/LICENSE /opt/azurite/NOTICE.txt ./

# Copy the pre-built SEA binaries from builder
COPY --from=builder /opt/azurite/release/azuritelinux /usr/local/bin/azurite
COPY --from=builder /opt/azurite/release/azurite-bloblinux /usr/local/bin/azurite-blob
COPY --from=builder /opt/azurite/release/azurite-queuelinux /usr/local/bin/azurite-queue
COPY --from=builder /opt/azurite/release/azurite-tablelinux /usr/local/bin/azurite-table

# Blob Storage Port
EXPOSE 10000
# Queue Storage Port
EXPOSE 10001
# Table Storage Port
EXPOSE 10002

CMD ["azurite", "-l", "/data", "--blobHost", "0.0.0.0", "--queueHost", "0.0.0.0", "--tableHost", "0.0.0.0"]
