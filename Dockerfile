#
# Builder
#
FROM node:22-alpine3.21 as builder

WORKDIR /opt/azurite

# Install dependencies first
COPY *.json LICENSE NOTICE.txt ./

# Copy the source code and build the app
COPY src ./src
COPY tests ./tests
RUN  npm ci --unsafe-perm
RUN npm run build && \
  npm install -g --unsafe-perm  --loglevel verbose


# Production image
#
FROM node:22-alpine3.21

ENV NODE_ENV=production

WORKDIR /opt/azurite

# Default Workspace Volume
VOLUME [ "/data" ]

COPY package*.json LICENSE NOTICE.txt ./

COPY --from=builder /opt/azurite/dist/ dist/

RUN npm pkg set scripts.prepare="echo no-prepare"

RUN npm ci --unsafe-perm

RUN npm install -g --unsafe-perm --loglevel verbose

# Blob Storage Port
EXPOSE 10000
# Queue Storage Port
EXPOSE 10001
# Table Storage Port
EXPOSE 10002

CMD ["azurite", "-l", "/data", "--blobHost", "0.0.0.0","--queueHost", "0.0.0.0", "--tableHost", "0.0.0.0"]
