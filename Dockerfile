FROM node:10-alpine

WORKDIR /opt/azurite

VOLUME [ "/data" ]

COPY . .

RUN npm install
RUN npm run build
RUN npm install -g

# Blob Storage
EXPOSE 10000
# Queue Storage
EXPOSE 10001

CMD ["azurite", "-l", "/data", "--blobHost", "0.0.0.0"]