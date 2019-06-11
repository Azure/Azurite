FROM node:10

RUN npm install -g azurite
RUN mkdir /opt/azurite
RUN mkdir /opt/azurite/folder
ENTRYPOINT [ "azurite","-l","/opt/azurite/folder","--blobHost","0.0.0.0"] 

EXPOSE 10000 10001 10002
