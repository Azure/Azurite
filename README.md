# <img src="documentation/azure_logo.png" width="35" />  Azurite V3 

[![npm version](https://badge.fury.io/js/azurite.svg)](https://badge.fury.io/js/azurite)
[![Build Status](https://dev.azure.com/azure/Azurite/_apis/build/status/Azure.Azurite?branchName=main)](https://dev.azure.com/azure/Azurite/_build/latest?definitionId=105&branchName=main)

> Note:
> The latest Azurite V3 code, which supports Blob, Queue, and Table (preview) is in the main branch.
> The legacy Azurite V2 code is in the [legacy-master](https://github.com/Azure/azurite/tree/legacy-master) branch.

| Version                                                            | Azure Storage API Version | Service Support                | Description                                       | Reference Links                                                                                                                                                                                                         |
| ------------------------------------------------------------------ | ------------------------- | ------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.18.0                                                             | 2021-08-06                | Blob, Queue and Table(preview) | Azurite V3 based on TypeScript & New Architecture | [NPM](https://www.npmjs.com/package/azurite) - [Docker](https://hub.docker.com/_/microsoft-azure-storage-azurite) - [Visual Studio Code Extension](https://marketplace.visualstudio.com/items?itemName=Azurite.azurite) |
| [Legacy (v2)](https://github.com/Azure/Azurite/tree/legacy-master) | 2016-05-31                | Blob, Queue and Table          | Legacy Azurite V2                                 | [NPM](https://www.npmjs.com/package/azurite)                                                                                                                                                                            |

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

### 1. Listening Host Configuration

Optional. By default, Azurite V3 will listen to 127.0.0.1 as a local server.
You can customize the listening address per your requirements.

#### Only Accept Requests in Local Machine

```cmd
--blobHost 127.0.0.1
--queueHost 127.0.0.1
--tableHost 127.0.0.1
```

#### Allow Accepting Requests from Remote (potentially unsafe)

```cmd
--blobHost 0.0.0.0
--queueHost 0.0.0.0
--tableHost 0.0.0.0
```

### 2. Listening Port Configuration

Optional. By default, Azurite V3 will listen to 10000 as blob service port, and 10001 as queue service port, and 10002 as the table service port.
You can customize the listening port per your requirements.

> Warning: After using a customized port, you need to update connection string or configurations correspondingly in your Storage Tools or SDKs.
> If starting Azurite you see error `Error: listen EACCES 0.0.0.0:10000` the TCP port is most likely already occupied by another process.

#### Customize Blob/Queue Service Listening Port

```cmd
--blobPort 8888
--queuePort 9999
--tablePort 11111
```

#### Let System Auto Select an Available Port

```cmd
--blobPort 0
--queuePort 0
--tablePort 0
```

> Note: The port in use is displayed on Azurite startup.

### 3. Workspace Path Configuration

Optional. Azurite V3 needs to persist metadata and binary data to local disk during execution.

You can provide a customized path as the workspace location, or by default, Current process working directory will be used.

```cmd
-l c:\azurite
--location c:\azurite
```

### 4. Access Log Configuration

Optional. By default Azurite will display access log in console. **Disable** it by:

```cmd
-s
--silent
```

### 5. Debug Log Configuration

Optional. Debug log includes detailed information on every request and exception stack traces.
Enable it by providing a valid local file path for the debug log destination.

```cmd
-d path/debug.log
--debug path/debug.log
```

### 6. Loose Mode Configuration

Optional. By default Azurite will apply strict mode. Strict mode will block unsupported request headers or parameters. **Disable** it by enabling loose mode:

```cmd
-L
--loose
```

### 7. Certificate Configuration (HTTPS)

Optional. By default Azurite will listen on HTTP protocol. Provide a PEM or PFX certificate file path to enable HTTPS mode:

```cmd
--cert path/server.pem
```

When `--cert` is provided for a PEM file, must provide coresponding `--key`.

```cmd
--key path/key.pem
```

When `--cert` is provided for a PFX file, must provide coresponding `--pwd`

```cmd
--pwd pfxpassword
```

### 8. OAuth Configuration

Optional. By default, Azurite doesn't support OAuth and bearer token. Enable OAuth authentication for Azurite by:

```
--oauth basic
```

> Note. OAuth requires HTTPS endpoint. Make sure HTTPS is enabled by providing `--cert` parameter along with `--oauth` parameter.

Currently, Azurite supports following OAuth authentication levels:

#### Basic

In basic level, `--oauth basic`, Azurite will do basic authentication, like validating incoming bearer token, checking issuer, audience, expiry. But Azurite will NOT check token signature and permission.

### 9. Skip API Version Check

Optional. By default Azurite will check the request API version is valid API version. Skip the API version check by:

```cmd
--skipApiVersionCheck
```

### 10. Disable Product Style Url

Optional. When using FQDN instead of IP in request Uri host, by default Azurite will parse storage account name from request Uri host. Force parsing storage account name from request Uri path by:

```cmd
--disableProductStyleUrl
```

### 11. Command Line Options Differences between Azurite V2

Azurite V3 supports SharedKey, Account Shared Access Signature (SAS), Service SAS, OAuth, and Public Container Access authentications, you can use any Azure Storage SDKs or tools like Storage Explorer to connect Azurite V3 with any authentication strategy.

An option to bypass authentication is **NOT** provided in Azurite V3.

## Supported Environment Variable Options

When starting Azurite from npm command line `azurite` or docker image, following environment variables are supported for advanced customization.

### Customized Storage Accounts & Keys

Azurite V3 allows customizing storage account names and keys by providing environment variable `AZURITE_ACCOUNTS` with format `account1:key1[:key2];account2:key1[:key2];...`.

For example, customize one storage account which has only one key:

```cmd
set AZURITE_ACCOUNTS="account1:key1"
```

Or customize multi storage accounts and each has 2 keys:

```cmd
set AZURITE_ACCOUNTS="account1:key1:key2;account2:key1:key2"
```

Azurite will refresh customized account name and key from environment variable every minute by default. With this feature, we can dynamically rotate account key, or add new storage accounts on the air without restarting Azurite instance.

> Note. Default storage account `devstoreaccount1` will be disabled when providing customized storage accounts.

> Note. Should update connection string accordingly if using customized account name and key.

> Note. Use `export` keyword to set environment variable in Linux like environment, `set` in Windows.

### Customized Metadata Storage by External Database (Preview)

By default, Azurite leverages [loki](https://github.com/techfort/LokiJS) as metadata database.
However, as an in-memory database, loki limits Azurite's scalability and data persistency.
Set environment variable `AZURITE_DB=dialect://[username][:password][@]host:port/database` to make Azurite blob service switch to a SQL database based metadata storage, like MySql, SqlServer.

For example, connect to MySql or SqlServer by set environment variables:

```bash
set AZURITE_DB=mysql://username:password@localhost:3306/azurite_blob
set AZURITE_DB=mssql://username:password@localhost:1024/azurite_blob
```

When Azurite starts with above environment variable, it connects to the configured database, and creates tables if not exist.
This feature is in preview, when Azurite changes database table schema, you need to drop existing tables and let Azurite regenerate database tables.

> Note. Need to manually create database before starting Azurite instance.

> Note. Blob Copy & Page Blob are not supported by SQL based metadata implementation.

> Tips. Create database instance quickly with docker, for example `docker run --name mysql -p 3306:3306 -e MYSQL_ROOT_PASSWORD=my-secret-pw -d mysql:latest`. Grant external access and create database `azurite_blob` using `docker exec mysql mysql -u root -pmy-secret-pw -e "GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION; FLUSH PRIVILEGES; create database azurite_blob;"`. Notice that, above commands are examples, you need to carefully define the access permissions in your production environment.

## HTTPS Setup

Azurite natively supports HTTPS with self-signed certificates via the `--cert` and `--key`/`--pwd` options. You have two certificate type options: PEM or PFX. PEM certificates are split into "cert" and "key" files. A PFX certificate is a single file that can be assigned a password. Follow the according links for detailed explanations.

### [PEM](documentation/PEM_guide.md)

### [PFX](documentation/PFX_guide.md)


## Usage with Azure Storage SDKs or Tools

### Default Storage Account

Azurite V3 provides support for a default storage account as General Storage Account V2 and associated features.

- Account name: `devstoreaccount1`
- Account key: `Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==`

> Note. Besides SharedKey authentication, Azurite V3 supports account, OAuth, and service SAS authentication. Anonymous access is also available when container is set to allow public access.

### Customized Storage Accounts & Keys

As mentioned by above section. Azurite V3 allows customizing storage account names and keys by providing environment variable `AZURITE_ACCOUNTS` with format `account1:key1[:key2];account2:key1[:key2];...`.

For example, customize one storage account which has only one key:

```cmd
set AZURITE_ACCOUNTS="account1:key1"
```

Or customize multi storage accounts and each has 2 keys:

```cmd
set AZURITE_ACCOUNTS="account1:key1:key2;account2:key1:key2"
```

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

To use Azurite with the [Azure SDKs](https://aka.ms/azsdk), you can use OAuth with HTTPS options:

`azurite --oauth basic --cert certname.pem --key certname-key.pem`

#### Azure Blob Storage

You can then instantiate BlobContainerClient, BlobServiceClient, or BlobClient.

```csharp
// With container url and DefaultAzureCredential
var client = new BlobContainerClient(new Uri("https://127.0.0.1:10000/devstoreaccount1/container-name"), new DefaultAzureCredential());

// With connection string
var client = new BlobContainerClient("DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=https://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=https://127.0.0.1:10001/devstoreaccount1;", "container-name");

// With account name and key
var client = new BlobContainerClient(new Uri("https://127.0.0.1:10000/devstoreaccount1/container-name"), new StorageSharedKeyCredential("devstoreaccount1", "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=="));
```

#### Azure Queue Storage

You can also instantiate QueueClient or QueueServiceClient.

```csharp
// With queue url and DefaultAzureCredential
var client = new QueueClient(new Uri("https://127.0.0.1:10001/devstoreaccount1/queue-name"), new DefaultAzureCredential());

// With connection string
var client = new QueueClient("DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=https://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=https://127.0.0.1:10001/devstoreaccount1;", "queue-name");

// With account name and key
var client = new QueueClient(new Uri("https://127.0.0.1:10001/devstoreaccount1/queue-name"), new StorageSharedKeyCredential("devstoreaccount1", "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=="));
```

### Storage Explorer

See the [Documentation](documentation/storage_explorer.md), for details on how to connect to Storage Explorer with Azurite HTTP or Azurite HTTPS (Connection String / Importing Certificates).

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
