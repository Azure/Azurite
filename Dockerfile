#
# Builder
#
FROM node:lts-alpine AS builder

WORKDIR /opt/azurite

# Install dependencies first
COPY *.json LICENSE NOTICE.txt ./
RUN npm config set unsafe-perm=true && \
  npm ci

# Copy the source code and build the app
COPY src ./src
COPY tests ./tests
RUN npm run build && \
  npm run test && \
  npm install -g --loglevel verbose


#
# Production image
#
FROM node:lts-alpine

ENV NODE_ENV=production

WORKDIR /opt/azurite

# Default Workspace Volume
VOLUME [ "/data" ]

COPY package*.json LICENSE NOTICE.txt ./

RUN npm config set unsafe-perm=true && \
  npm ci

COPY --from=builder /opt/azurite/dist/ dist/

RUN npm install -g --loglevel verbose

# Blob Storage Port
EXPOSE 10000
# Queue Storage Port
EXPOSE 10001

CMD ["azurite", "-l", "/data", "--blobHost", "0.0.0.0","--queueHost", "0.0.0.0"]
