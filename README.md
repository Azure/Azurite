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

#### HTTP Connection Strings

You can pass the following connection strings to the [Azure SDKs](https://aka.ms/azsdk) or tools (like Azure CLI 2.0 or Storage Explorer)

The full connection string is:

```bash
DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;
```

Take blob service only, the full connection string is:

```bash
DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;
```

Or if the SDK or tools support following short connection string:

```bash
UseDevelopmentStorage=true;
```

#### HTTPS Connection Strings

The full HTTPS connection string is:

```bash
DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=https://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=https://127.0.0.1:10001/devstoreaccount1;TableEndpoint=https://127.0.0.1:10002/devstoreaccount1
```

To use the Blob service only, the HTTPS connection string is:

```bash
DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=https://127.0.0.1:10000/devstoreaccount1;
```

If you used `dotnet dev-certs` to generate your self-signed certificate, then you need to use the following connection string, because that only generates a cert for `localhost`, not `127.0.0.1`.

```bash
DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=https://localhost:10000/devstoreaccount1;QueueEndpoint=https://localhost:10001/devstoreaccount1;
```

### Azure SDKs

See the [SDK Documentation](documentation/sdk_guide.md), for details on how to use Azurite with the Azure SDKs.

### Storage Explorer

See the [Storage Explorer Documentation](documentation/storage_explorer.md), for details on how to connect to Storage Explorer with Azurite HTTP or Azurite HTTPS (Connection String / Importing Certificates).

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

Because Azurite runs as a local instance for persistent data storage, there are differences in functionality between Azurite and an Azure storage account in the cloud.

### Storage Accounts

You could enable multiple accounts by setting up environment variable `AZURITE_ACCOUNTS`. See the [section](#customized-storage-accounts--keys-1) above.

Optionally, you could modify your hosts file, to access accounts with production-style URL. See section below.

### Endpoint & Connection URL

The service endpoints for Azurite are different from those of an Azure storage account. The difference is because Azuite runs on local computer, and normally, no DNS resolves address to local.

When you address a resource in an Azure storage account, use the following scheme. The account name is part of the URI host name, and the resource being addressed is part of the URI path:

```
<http|https>://<account-name>.<service-name>.core.windows.net/<resource-path>
```

For example, the following URI is a valid address for a blob in an Azure storage account:

```
https://myaccount.blob.core.windows.net/mycontainer/myblob.txt
```

#### IP-style URL

However, because Azuite runs on local computer, it use IP-style URI by default, and the account name is part of the URI path instead of the host name. Use the following URI format for a resource in Azurite:

```
http://<local-machine-address>:<port>/<account-name>/<resource-path>
```

For example, the following address might be used for accessing a blob in Azurite:

```
http://127.0.0.1:10000/myaccount/mycontainer/myblob.txt
```

The service endpoints for Azurite blob service:

```
http://127.0.0.1:10000/<account-name>/<resource-path>
```

#### Production-style URL

Optionally, you could modify your hosts file, to access an account with production-style URL.

First, add line(s) to your hosts file, like:

```
127.0.0.1 account1.blob.localhost
127.0.0.1 account1.queue.localhost
127.0.0.1 account1.table.localhost
```

Secondly, set environment variables to enable customized storage accounts & keys:

```
set AZURITE_ACCOUNTS="account1:key1:key2"
```

You could add more accounts. See the [section](#customized-storage-accounts--keys-1) above.

Finally, start Azurite and use a customized connection string to access your account.

In the connection string below, it is assumed default ports are used.

```
DefaultEndpointsProtocol=http;AccountName=account1;AccountKey=key1;BlobEndpoint=http://account1.blob.localhost:10000;QueueEndpoint=http://account1.queue.localhost:10001;TableEndpoint=http://account1.table.localhost:10002;
```

> Note. Do not access default account in this way with Azure Storage Explorer. There is a bug that Storage Explorer is always adding account name in URL path, causing failures.

> Note. When use Production-style URL to access Azurite, by default the account name should be the host name in FQDN, like "http://devstoreaccount1.blob.localhost:10000/container". To use Production-style URL with account name in URL path, like "http://foo.bar.com:10000/devstoreaccount1/container", please start Azurite with `--disableProductStyleUrl`.

> Note. If use "host.docker.internal" as request Uri host, like "http://host.docker.internal:10000/devstoreaccount1/container", Azurite will always get account name from request Uri path, not matter Azurite start with `--disableProductStyleUrl` or not.

### Scalability & Performance

> Please reach to us if you have requirements or suggestions for a distributed Azurite implementation or higher performance.

Azurite is not a scalable storage service and does not support many concurrent clients. There is also no performance and TPS guarantee, they highly depend on the environments Azurite has deployed.

### Error Handling

> Please reach to us if you have requirements or suggestions for a specific error handling.

Azurite tries to align with Azure Storage error handling logic, and provides best-efforts alignment based on Azure Storage online documentation. But CANNOT provide 100% alignment, such as error messages (returned in error response body) maybe different (while error status code will align).

### API Version Compatible Strategy

Azurite V3 follows a **Try best to serve** compatible strategy with Azure Storage API versions:

- An Azurite V3 instance has a baseline Azure Storage API version.
  - A Swagger definition (OpenAPI doc) with the same API version will be used to generate protocol layer APIs and interfaces.
  - Azurite should implement all the possible features provided in this API service version.
- If an incoming request has **the same API version** Azurite provides, Azurite should handle the request with parity to Azure Storage.
- If an incoming request has a **higher API version** than Azurite, Azurite will return a InvalidHeaderValue error for `x-ms-version` (HTTP status code 400 - Bad Request).
- If an incoming request has a **lower API version** header than Azurite, Azurite will attempt to handle the request with Azurite's baseline API version behavior instead of that specified in the request.
- Azurite will return API version in response header as the baseline API version
- SAS accepts pattern from API version 2015-04-05

### RA-GRS

Azurite supports read-access geo-redundant replication (RA-GRS). For storage resources both in the cloud and in the local emulator, you can access the secondary location by appending -secondary to the account name. For example, the following address might be used for accessing a blob using the secondary in Azurite:

```
http://127.0.0.1:10000/devstoreaccount1-secondary/mycontainer/myblob.txt
```

> Note. Secondary endpoint is not read-only in Azurite, which diffs from Azure Storage.

## Differences between Azurite V3 and Azurite V2

Both Azurite V3 and Azurite V2 aim to provide a convenient emulation for customers to quickly try out Azure Storage services locally. There are lots of differences between Azurite V3 and legacy Azurite V2.

### Architecture

Architecture in Azurite V3 has been refactored, it's more flexible and robust. It provides the flexibility to support following scenarios in the future:

- Use other HTTP frameworks instead of express.js
- Customized new handler layer implementation, such as redirecting requests to Azure Storage services
- Implement and inject a new persistency layer implementation, such as one based on a different database service
- Provide support for multiple azure storage accounts and authentication
- Detailed debug logging for easy issue investigation and request tracking
- Create HTTPS server
- ...

### Server Code Generator

Azurite V3 leverages a TypeScript server code generator based on Azure Storage REST API swagger specifications. This reduces manual efforts and ensures alignment with the API implementation.

### TypeScript

Azurite V3 selected TypeScript as its' programming language, as this facilitates broad collaboration, whilst also ensuring quality.

### Features Scope

Legacy Azurite V2 supports Azure Storage Blob, Queue and Table services.
Azurite V3 currently only supports Azure Storage blob service. Queue service is supported after V3.2.0-preview.
Table service support is currently under discussion.

Azurite V3 supports features from Azure Storage API version 2021-08-06, and will maintain parity with the latest API versions, in a more frequent update frequency than legacy Azurite V2.

## TypeScript Server Code Generator

Azurite V3 leverages a TypeScript Node.js Server Code Generator to generate the majority of code from Azure Storage REST APIs swagger specification.
Currently, the generator project is private, under development and only used by Azurite V3.
We have plans to make the TypeScript server generator public after Azurite V3 releases.
All the generated code is kept in `generated` folder, including the generated middleware, request and response models.

## Support Matrix

Latest release targets **2021-08-06** API version **blob** service.

See the [Detailed Support Matrix](documentation/support_matrix.md)

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
