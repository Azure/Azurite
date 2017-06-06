FROM node:alpine

WORKDIR /opt/azurite

COPY package.json /opt/azurite
RUN npm install

COPY bin /opt/azurite/bin
COPY lib /opt/azurite/lib

VOLUME /opt/azurite/folder

EXPOSE 10000

CMD ["node", "bin/azurite", "-l", "/opt/azurite/folder"]
