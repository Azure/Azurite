#
# Builder
#
FROM node:20-alpine3.19 AS builder

WORKDIR /opt/azurite

# Install dependencies first
COPY *.json LICENSE NOTICE.txt ./

# Copy the source code and build the app
COPY src ./src
COPY tests ./tests
RUN npm ci
RUN npm run build && \
  npm install -g --loglevel verbose


#
# Production image
#
FROM node:20-alpine3.19

RUN apk update && apk upgrade --no-cache

ENV NODE_ENV=production

WORKDIR /opt/azurite

# Default Workspace Volume
VOLUME [ "/data" ]

COPY package*.json LICENSE NOTICE.txt ./

COPY --from=builder /opt/azurite/dist/ dist/

RUN npm update -g
RUN npm install --ignore-scripts --loglevel verbose
RUN npm install -g --ignore-scripts --loglevel verbose

# Blob Storage Port
EXPOSE 10000
# Queue Storage Port
EXPOSE 10001
# Table Storage Port
EXPOSE 10002

CMD ["azurite", "-l", "/data", "--blobHost", "0.0.0.0","--queueHost", "0.0.0.0", "--tableHost", "0.0.0.0"]
