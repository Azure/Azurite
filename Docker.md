# Docker Image Architecture and Build Guide

## Overview

Azurite Docker images are optimized using Node.js SEA (Single Executable Application) binaries for improved security, performance, and minimal size. This document explains the architecture, benefits, and how to build locally.

## Image Architecture

### Production Image

The Azurite Docker image uses a minimal two-stage build:

```dockerfile
# Stage 1: Builder
FROM node:22-alpine3.23 as builder
# - Installs dependencies
# - Compiles TypeScript to JavaScript
# - Builds Node.js SEA binary via npm run build:exe

# Stage 2: Production
FROM alpine:3.23
# - Minimal Alpine base
# - Copies pre-built SEA binary only
# - No Node.js, npm, or development tools
```

### Why SEA Binary?

Node.js SEA (Single Executable Application) bundles:
- Node.js runtime
- All dependencies (bundled via esbuild)
- Application code (TypeScript → JavaScript)

...into a **single self-contained binary** that doesn't require:
- Node.js installation
- npm or package manager
- External dependencies

## Security Improvements

### Reduced npm Exposure

The Docker image previously included npm 10.9.x, which carried transitive dependencies with known CVEs:
- `tar` - CVE in package extraction
- `brace-expansion` - CVE in glob pattern expansion
- Other transitive vulnerabilities

**Current approach:** npm is not present in the production image, so its transitive dependencies (and their CVEs) are not present either. This does not guarantee the image is free of all CVEs — the Alpine base and the SEA binary itself can still have vulnerabilities.

### Smaller Image

- **Before:** 595MB image with Node.js, npm, and full dependency tree
- **After:** 212MB image with Alpine + binary only

A smaller image has fewer files and tools present:
- Fewer files to exploit
- No package manager tools
- No npm supply-chain risks
- Read-only container (expected for services)

## Size Benefits

| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| Image Size | 595MB | 212MB | **64% reduction (383MB)** |
| npm Bloat | ~100MB unused | Removed | **100MB saved** |
| Node.js Runtime | Full | Bundled in binary | **~75MB saved** |
| Alpine Base | 8MB | 8MB | Same |

**Impact:** Faster image pulls, faster deployment, less disk space, faster container startup.

## Building Locally

### Prerequisites

```bash
# Node.js 22+ (matches Dockerfile base)
node --version  # v22.x

# npm (for building)
npm --version   # 10.9.x

# Docker
docker --version
```

### Build Docker Image

```bash
# From Azurite root directory
docker build -t azurite-local .
```

The build process will:
1. Install dependencies (`npm ci`)
2. Compile TypeScript (`npm run build`)
3. Build SEA binary (`npm run build:linux`)
4. Copy binary to minimal Alpine image
5. Result: `azurite-local` image (~212MB)

### Run Locally Built Image

```bash
# All services (Blob, Queue, Table)
docker run -p 10000:10000 -p 10001:10001 -p 10002:10002 azurite-local

# With volume mount for persistent data
docker run -p 10000:10000 -p 10001:10001 -p 10002:10002 \
  -v /your/local/path:/data \
  azurite-local

# Just the Blob service
docker run -p 10000:10000 azurite-local azurite-blob --blobHost 0.0.0.0
```

### Build with Custom Options

```bash
# Build with specific tag
docker build -t my-org/azurite:latest .

# Build without cache (fresh build)
docker build --no-cache -t azurite:latest .

# Build with build args (if needed for CI/CD)
docker build --build-arg NODE_ENV=production -t azurite:latest .
```

## Development vs Production

### Development Workflow (npm)

For development and testing, use npm directly:

```bash
# Install dependencies
npm ci

# Build and run
npm run azurite

# Just Blob service
npm run blob

# Run tests
npm run test
```

**You still have Node.js, npm, and development tools available.**

### Production Deployment (Docker)

For production or containerized deployment, use the Docker image:

```bash
# Pull from MCR
docker pull mcr.microsoft.com/azure-storage/azurite

# Or build and deploy locally
docker build -t azurite:prod .
docker run -p 10000:10000 -p 10001:10001 -p 10002:10002 azurite:prod
```

**The Docker image contains only the binary — no npm, no development tools.**

## Docker Compose

Example `docker-compose.yml`:

```yaml
version: "3.9"
services:
  azurite:
    image: azurite-local  # or mcr.microsoft.com/azure-storage/azurite
    container_name: "azurite"
    hostname: azurite
    restart: always
    ports:
      - "10000:10000"  # Blob
      - "10001:10001"  # Queue
      - "10002:10002"  # Table
    volumes:
      - ./data:/data
    environment:
      - AZURITE_SKIP_API_VERSION_CHECK=true  # Optional
```

Run with:

```bash
docker-compose up
```

## Backwards Compatibility

### Breaking Changes

See [BreakingChanges.md](BreakingChanges.md) for the full entry. In summary:

- The container no longer includes npm or Node.js tooling. If you were extending the image to run npm, build Azurite locally instead (`npm ci && npm run azurite`).
- The `azurite`, `azurite-blob`, `azurite-queue`, and `azurite-table` entrypoints all continue to work, now backed by SEA binaries instead of npm-installed scripts.

### What Stayed the Same

- All documented `docker run` commands for the combined `azurite` entrypoint work identically
- All ports are exposed the same way
- All volume mounts work the same

### What Changed

- Container no longer includes npm
- Image is smaller
- npm and its transitive dependencies are no longer present in the production image

## Performance Improvements

The SEA binary approach provides:

- **Faster startup:** No Node.js initialization, binary loads directly
- **Faster pulls:** 64% smaller image (383MB less to download)
- **Faster deployment:** Less time to spin up containers
- **Lower memory:** No npm or development tools overhead

## Multi-Architecture Builds

For CI/CD pipeline building multi-architecture images:

```bash
# Build for multiple platforms (requires Docker Buildx)
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t azurite:latest \
  .
```

Note: Linux binary is available via `npm run build:exe`. Windows binary requires Windows build environment.

## Troubleshooting

### Image Build Fails

```bash
# Ensure Node.js 22+
node --version

# Clean and rebuild
rm -rf dist/ release/ temp/ node_modules/
npm ci
docker build --no-cache -t azurite .
```

### Container Doesn't Start

```bash
# Check logs
docker logs <container_id>

# Run with verbose output
docker run --rm azurite-local azurite --verbose
```

### Ports Already in Use

```bash
# Map to different host ports
docker run -p 7777:10000 -p 8888:10001 -p 9999:10002 azurite-local
```

## Security Best Practices

1. **Use official MCR images** when possible
2. **Keep Docker updated** for latest Alpine and security patches
3. **Use volume mounts** for persistent data instead of building data into the image
4. **Run as non-root** if your use case allows it (not yet implemented in default image)
5. **Scan images** with tools like Trivy or Docker Scout
6. **Monitor image size** — if it grows beyond 250MB, investigate

## Related

- [README.md](README.md) — Main documentation
- [CONTRIBUTION.md](CONTRIBUTION.md) — Development guide
- [Dockerfile](Dockerfile) — Image build specification
- [ChangeLog.md](ChangeLog.md) — Version history
