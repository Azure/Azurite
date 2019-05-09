FROM node:10.6-alpine

WORKDIR /opt/azurite

COPY package.json package.json

RUN npm install

COPY . .

RUN npm run build
RUN npm install -g

# Blob Storage Emulator
EXPOSE 10000
# Azure Queue Storage Emulator
EXPOSE 10001
# Azure Table Storage Emulator
EXPOSE 10002


CMD ["azurite","-l", "/azurite-data", "--blobHost", "0.0.0.0"]