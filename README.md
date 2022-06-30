# <img src="documentation/azure_logo.png" width="35" />  Azurite V3 

[![npm version](https://badge.fury.io/js/azurite.svg)](https://badge.fury.io/js/azurite)
[![Build Status](https://dev.azure.com/azure/Azurite/_apis/build/status/Azure.Azurite?branchName=main)](https://dev.azure.com/azure/Azurite/_build/latest?definitionId=105&branchName=main)

> Note:
> The latest Azurite V3 code, which supports Blob, Queue, and Table (preview) is in the main branch.
> The legacy Azurite V2 code is in the [legacy-master](https://github.com/Azure/azurite/tree/legacy-master) branch.

  - [Introduction](#introduction)
  - [Features & Key Changes in Azurite V3](#features--key-changes-in-azurite-v3)
  - [Getting Started](#getting-started)
  - [Supported Command Line Options](#supported-command-line-options)
  - [Supported Environment Variable Options](#supported-environment-variable-options)
  - [HTTPS Setup](#https-setup)
  - [Usage with Azure Storage SDKs or Tools](#usage-with-azure-storage-sdks-or-tools)
  - [Workspace Structure](#workspace-structure)
  - [Differences between Azurite and Azure Storage](#differences-between-azurite-and-azure-storage)
  - [Differences between Azurite V3 and Azurite V2](#differences-between-azurite-v3-and-azurite-v2)
  - [TypeScript Server Code Generator](#typescript-server-code-generator)
  - [Support Matrix](#support-matrix)
  - [License](#license)
  - [We Welcome Contributions!](#we-welcome-contributions)

## Introduction

Azurite is an open source Azure Storage API compatible server (emulator). Based on Node.js, Azurite provides cross platform experiences for customers wanting to try Azure Storage easily in a local environment. Azurite simulates most of the commands supported by Azure Storage with minimal dependencies.

Azurite V2 is manually created with pure JavaScript, popular and active as an open source project. However, Azure Storage APIs are growing and keeping updating, manually keeping Azurite up to date is not efficient and prone to bugs. JavaScript also lacks strong type validation which prevents easy collaboration.

Compared to V2, Azurite V3 implements a new architecture leveraging code generated by a TypeScript Server Code Generator we created. The generator uses the same swagger (modified) used by the new Azure Storage SDKs. This reduces manual effort and facilitates better code alignment with storage APIs.

3.0.0-preview is the first release version using Azurite's new architecture.

## Features & Key Changes in Azurite V3

| Version                                                            | Azure Storage API Version | Service Support                | Description                                       | Reference Links                                                                                                                                                                                                         |
| ------------------------------------------------------------------ | ------------------------- | ------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.18.0                                                             | 2021-08-06                | Blob, Queue and Table(preview) | Azurite V3 based on TypeScript & New Architecture | [NPM](https://www.npmjs.com/package/azurite) - [Docker](https://hub.docker.com/_/microsoft-azure-storage-azurite) - [Visual Studio Code Extension](https://marketplace.visualstudio.com/items?itemName=Azurite.azurite) |
| [Legacy (v2)](https://github.com/Azure/Azurite/tree/legacy-master) | 2016-05-31                | Blob, Queue and Table          | Legacy Azurite V2                                 | [NPM](https://www.npmjs.com/package/azurite)                                                                                                                                                                            |

For a full list of all key changes and new features in V3, see [Features & Key Changes](documentation/key_changes_V3.md)

## Getting Started

Try with any of following ways to start an Azurite V3 instance (follow the links for detailed explanations).

### 1. GitHub

After cloning source code, execute following commands to install and start Azurite V3.

```bash
npm ci
npm run build
npm install -g
azurite
```


### 2. Visual Studio Code Extension

Azurite V3 can be installed from [Visual Studio Code extension market](https://marketplace.visualstudio.com/items?itemName=Azurite.azurite).
You can quickly start or close Azurite by clicking Azurite **status bar item** or following commands.

For all supported Visual Studio Code commands, see [Supported Commands](documentation/vscode-commands.md).


### 3. [NPM](documentation/getting_started_npm.md)


### 4. [DockerHub](https://hub.docker.com/_/microsoft-azure-storage-azurite) 
#### - [see the docker image guide](documentation/docker_image_guide.md)


### 5. NuGet

_Releasing Azurite V3 to NuGet is under investigation._


### 6. Visual Studio

_Integrate Azurite with Visual Studio is under investigation._


## Supported Command Line Options

Find a comprehensive list of all [command line options here](/documentation/commandline_options.md).

## Supported Environment Variable Options

Find a comprehensive list of all [supported environment variable options here](/documentation/environment_variable_options.md), which are supported for advanced customization when starting Azurite from npm command line `azurite` or docker image.


## HTTPS Setup

Azurite natively supports HTTPS with self-signed certificates via the `--cert` and `--key`/`--pwd` options. You have two certificate type options: PEM or PFX. PEM certificates are split into "cert" and "key" files. A PFX certificate is a single file that can be assigned a password. Follow the according links for detailed explanations.

### [PEM](documentation/PEM_guide.md)

### [PFX](documentation/PFX_guide.md)


## Usage with Azure Storage SDKs or Tools

### Default Storage Account & Customized Storage Accounts & Keys

See the [dedicated documentation](/documenation/default_customized_storage_account.md) for information on the default storage account and customization of storage account names and keys.

### Connection Strings

See the [dedicated documentation](/documenation/default_customized_storage_account.md) for information on the connection strings to the [Azure SDKs](https://aka.ms/azsdk) or tools (like Azure CLI 2.0 or Storage Explorer).

### Azure SDKs

See the [SDK documentation](documentation/sdk_guide.md), for details on how to use Azurite with the Azure SDKs.

### Storage Explorer

See the [Storage Explorer documentation](documentation/storage_explorer.md), for details on how to connect to Storage Explorer with Azurite HTTP or Azurite HTTPS (Connection String / Importing Certificates).

## Workspace Structure

Following files or folders may be created when initializing Azurite in selected workspace location.

- `azurite_db_blob.json` Metadata file used by Azurite blob service. (No when starting Azurite against external database)
- `azurite_db_blob_extent.json` Extent metadata file used by Azurite blob service. (No when starting Azurite against external database)
- `blobstorage` Persisted bindary data by Azurite blob service.
- `azurite_db_queue.json` Metadata file used by Azurite queue service. (No when starting Azurite against external database)
- `azurite_db_queue_extent.json` Extent metadata file used by Azurite queue service. (No when starting Azurite against external database)
- `queuestorage` Persisted bindary data by Azurite queue service.
- `azurite_db_table.json` Metadata file used by Azurite table service.

> Note. Delete above files and folders and restart Azurite to clean up Azurite. It will remove all data stored in Azurite!!

## Differences between Azurite and Azure Storage

See the [dedicated documentation](/documenation/differences_azurite_azure-storage.md) for an overview of the differences between Azurite and Azure Storage

## Differences between Azurite V3 and Azurite V2

Both Azurite V3 and Azurite V2 aim to provide a convenient emulation for customers to quickly try out Azure Storage services locally. There are lots of differences between Azurite V3 and legacy Azurite V2. For more information you can visit [Differences between Azurite V3 and Azurite V2](/documenation/differences_azurite_v3_v2.md).

## TypeScript Server Code Generator

Azurite V3 leverages a TypeScript Node.js Server Code Generator to generate the majority of code from Azure Storage REST APIs swagger specification.
Currently, the generator project is private, under development and only used by Azurite V3.
We have plans to make the TypeScript server generator public after Azurite V3 releases.
All the generated code is kept in `generated` folder, including the generated middleware, request and response models.

## Support Matrix

Latest release targets **2021-08-06** API version **blob** service.

See the [Detailed Support Matrix](documentation/support_matrix.md).

## License

This project is licensed under MIT.

## We Welcome Contributions!

> Go to [GitHub project](https://github.com/Azure/Azurite/projects) page or [GitHub issues](https://github.com/Azure/Azurite/issues) for the milestone and TODO items we are used for tracking upcoming features and bug fixes.

We are currently working on Azurite V3 to implement the remaining Azure Storage REST APIs.
We finished the basic structure and majority of features in Blob Storage, as can be seen in the support matrix.
The detailed work items are also tracked in GitHub repository projects and issues.

Any contribution and suggestions for Azurite V3 is welcome, please goto [CONTRIBUTION.md](https://github.com/Azure/Azurite/blob/main/CONTRIBUTION.md) for detailed contribution guidelines. Alternatively, you can open GitHub issues voting for any missing features in Azurite V3.

Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit <https://cla.microsoft.com.>

When you submit a pull request, a CLA-bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., label, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
