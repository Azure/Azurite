FROM node:10-alpine

WORKDIR /opt/azurite

# Default Workspace Volume
VOLUME [ "/data" ]

COPY . .

RUN npm install
RUN npm run build
RUN npm install -g

# Blob Storage Port
EXPOSE 10000
# Queue Storage Port
EXPOSE 10001

CMD ["azurite", "-l", "/data", "--blobHost", "0.0.0.0"]