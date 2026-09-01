#
# Builder - compile TypeScript and build SEA binary
#
FROM node:22-alpine3.23 as builder

WORKDIR /opt/azurite

# Install dependencies
COPY *.json LICENSE NOTICE.txt ./
COPY src ./src
COPY tests ./tests
COPY scripts ./scripts

RUN npm ci --unsafe-perm
RUN npm run build && npm run build:exe

#
# Production image - minimal, CVE-free, using SEA binary
#
FROM alpine:3.23

ENV NODE_ENV=production

WORKDIR /opt/azurite

# Default Workspace Volume
VOLUME [ "/data" ]

# Copy the pre-built SEA binary from builder
COPY --from=builder /opt/azurite/release/azuritelinux /usr/local/bin/azurite

# Blob Storage Port
EXPOSE 10000
# Queue Storage Port
EXPOSE 10001
# Table Storage Port
EXPOSE 10002

CMD ["azurite", "-l", "/data", "--blobHost", "0.0.0.0", "--queueHost", "0.0.0.0", "--tableHost", "0.0.0.0"]
