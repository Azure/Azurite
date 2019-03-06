# Azurite V3

## Introduction

A lightweight server compatible with Azure Blob and Queue Storage REST APIs. Azurite simulates most of the commands supported by it with minimal dependencies.

Azurite V3 leverages next generation architecture based on TypeScript and auto generated server codes.

## Features

- Blob Storage Features align with Azure Storage API Version 2018-03-28 (still under development)
  - SharedKey Authentication
  - Get/Set Blob Service Properties
  - Create/List/Delete Containers
  - Create/Read/List/Update/Delete Block Blobs
  - Create/Read/List/Update/Delete Page Blobs
  - Create/Read/List/Update/Delete Append Blobs
- Features New on V3
  - ES6 native promise and async methods, less dependencies
  - Auto generated protocol layer, models, serializer, deserializer and handler interfaces from swagger
  - Flexible structure to inject customized middlewares with generated middleware
  - Able to create different logical implementations by implementing generated handler interfaces
  - Detailed debugging log

## Differences between Azurite and Azure Storage Service (TODO)

Because the Azurite is an emulated environment running in a local persistency instance, there are differences in functionality between Azurite and an Azure storage account in the cloud.

## Getting Started

### GitHub

After cloning source code, execute following commands to start Azurite. Take blob service as example:

```bash
npm install
npm run build
node dist/bin.js
```

### NPM (TODO)

In order to run Azurite you need Node.js >= 8.0 installed on your system. Azurite works cross-platform on Windows, Linux, and OS X.

After installation you can install Azurite simply with npm which is Node.js package management tool and which is included with every Node.js installation.

```bash
$ npm install -g azurite
```

Simply start it with the following command:

```bash
$ azurite -l path/to/localfolder
```

This tells Azurite to store all data in a particular directory. If the -l option is ommitted it will use the current working directory. This also will start both blob storage and queue storage emulation in two different processes. You can also selectively start the different storage emulators.

For Blob Storage Emulator only:

```bash
$ azurite-blob -l path/to/azurite/workspace
```

### DockerHub (TODO)

Every release of Azurite starting with version 0.9.7 is available at Docker Hub and ready to be pulled with:

```bash
$ docker pull microsoft/azurite
```

Please note that the latest tag will always refer to the latest release.

To run the Docker image, execute the following command:

```bash
$ docker run -d -t -p 10000:10000 -p 10001:10001 -p 10002:10002 -v /path/to/folder:/opt/azurite/folder microsoft/azurite
```

## What TODOs are there?

We are currently working on Azurite V3 to implement Azure Storage REST APIs. Following are the major items need to be done for Azurite V3 new architecture. The detailed working items are also tracked in GitHub projects.

- Azure Storage Blob features implementation to 2018-03-28 API version
  - SharedKey Authentication
  - Shared Access Signature (SAS) Authentication
  - Key features for Service/Container/BlockBlob/PageBlob/AppendBlob
  - Other features
- Commandline parameters configuration align with legacy Azurite
- Logging support

Any contribution to Azurite V3 is welcome, please goto `CONTRIBUTION.md` for detailed contribution guideline.

Azurite V3 leverags a TypeScript Node.js server generator to generate majority of code from Azure Storage REST APIs swagger specification. Currently, the generator project is private, under development and only used by Azurite V3. We have a plan to make the TypeScript server generator public after Azurite V3 releases. All the generated code is kept in `generated` folder, including the generated middlewares, request and response models.

## License

This project is licensed under MIT.

## Contributing

This project welcomes contributions and suggestions. Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit <https://cla.microsoft.com.>

When you submit a pull request, a CLA-bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., label, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
