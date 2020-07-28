FROM node:lts-alpine

WORKDIR /opt/azurite

# Default Workspace Volume
VOLUME [ "/data" ]

COPY src ./src
COPY tests ./tests
COPY *.json ./
COPY LICENSE .
COPY NOTICE.txt .

RUN npm config set unsafe-perm=true
RUN npm ci
RUN npm run build
RUN ls -l
RUN npm install -g --loglevel verbose

# Blob Storage Port
EXPOSE 10000
# Queue Storage Port
EXPOSE 10001
# Table Storage Port
EXPOSE 10002

CMD ["azurite", "-l", "/data", "--blobHost", "0.0.0.0","--queueHost", "0.0.0.0", "--tableHost", "0.0.0.0"]