FROM node:alpine

WORKDIR /opt/azurite

COPY package.json /opt/azurite
RUN npm install

COPY bin /opt/azurite/bin
COPY lib /opt/azurite/lib
COPY test /opt/azurite/test

VOLUME /opt/azurite/folder

# Blob Storage Emulator
EXPOSE 10000
# Azure Queue Storage Emulator
EXPOSE 10001
# Azure Table Storage Emulator
EXPOSE 10002

ENV executable azurite

CMD ["sh", "-c", "node bin/${executable} -l /opt/azurite/folder"]
