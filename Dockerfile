FROM node:10-alpine

WORKDIR /opt/azurite

# Default Workspace Volume
VOLUME [ "/data" ]

COPY . .

RUN npm config set unsafe-perm=true
RUN npm ci
RUN npm run build
RUN ls -l
RUN npm install -g

# Blob Storage Port
EXPOSE 10000
# Queue Storage Port
EXPOSE 10001

CMD ["azurite", "-l", "/data", "--blobHost", "0.0.0.0","--queueHost", "0.0.0.0"]