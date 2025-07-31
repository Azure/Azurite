# Azurite V3

[![npm version](https://badge.fury.io/js/azurite.svg)](https://badge.fury.io/js/azurite)

> Note:
> The latest Azurite V3 code, which supports Blob, Queue, and Table (preview) is in the main branch.
> The legacy Azurite V2 code is in the [legacy-master](https://github.com/Azure/azurite/tree/legacy-master) branch.

| Version                                                            | Azure Storage API Version | Service Support                | Description                                       | Reference Links                                                                                                                                                                                                         |
| ------------------------------------------------------------------ | ------------------------- | ------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.35.0                                                             | 2025-11-05                | Blob, Queue and Table(preview) | Azurite V3 based on TypeScript & New Architecture | [NPM](https://www.npmjs.com/package/azurite) - [Docker](https://hub.docker.com/_/microsoft-azure-storage-azurite) - [Visual Studio Code Extension](https://marketplace.visualstudio.com/items?itemName=Azurite.azurite) |
| [Legacy (v2)](https://github.com/Azure/Azurite/tree/legacy-master) | 2016-05-31                | Blob, Queue and Table          | Legacy Azurite V2                                 | [NPM](https://www.npmjs.com/package/azurite)                                                                                                                                                                            |

- [Azurite V3](#azurite-v3)
  - [Introduction](#introduction)
  - [Features & Key Changes in Azurite V3](#features--key-changes-in-azurite-v3)
  - [Getting Started](#getting-started)
    - [GitHub](#github)
    - [NPM](#npm)
    - [Visual Studio Code Extension](#visual-studio-code-extension)
    - [DockerHub](#dockerhub)
      - [Docker Compose](#docker-compose)
    - [NuGet](#nuget)
    - [Visual Studio](#visual-studio)
  - [Supported Command Line Options](#supported-command-line-options)
    - [Listening Host Configuration](#listening-host-configuration)
    - [Listening Port Configuration](#listening-port-configuration)
    - [Workspace Path Configuration](#workspace-path-configuration)
    - [Access Log Configuration](#access-log-configuration)
    - [Debug Log Configuration](#debug-log-configuration)
    - [Loose Mode Configuration](#loose-mode-configuration)
    - [Certificate Configuration (HTTPS)](#certificate-configuration-https)
    - [OAuth Configuration](#oauth-configuration)
    - [Skip API Version Check](#skip-api-version-check)
    - [Disable Product Style Url](#disable-product-style-url)
    - [Disable Telemetry Collection](#disable-telemetry-collection)
    - [Use in-memory storage](#use-in-memory-storage)
    - [Command Line Options Differences between Azurite V2](#command-line-options-differences-between-azurite-v2)
  - [Supported Environment Variable Options](#supported-environment-variable-options)
    - [Customized Storage Accounts & Keys](#customized-storage-accounts--keys)
    - [Customized Metadata Storage by External Database (Preview)](#customized-metadata-storage-by-external-database-preview)
  - [HTTPS Setup](#https-setup)
    - [PEM](#pem)
    - [PFX](#pfx)
  - [Usage with Azure Storage SDKs or Tools](#usage-with-azure-storage-sdks-or-tools)
    - [Default Storage Account](#default-storage-account)
    - [Customized Storage Accounts & Keys](#customized-storage-accounts--keys-1)
    - [Connection Strings](#connection-strings)
    - [Azure SDKs](#azure-sdks)
    - [Storage Explorer](#storage-explorer)
  - [Workspace Structure](#workspace-structure)
  - [Differences between Azurite and Azure Storage](#differences-between-azurite-and-azure-storage)
    - [Storage Accounts](#storage-accounts)
    - [Endpoint & Connection URL](#endpoint--connection-url)
    - [Scalability & Performance](#scalability--performance)
    - [Error Handling](#error-handling)
    - [API Version Compatible Strategy](#api-version-compatible-strategy)
    - [RA-GRS](#ra-grs)
  - [Differences between Azurite V3 and Azurite V2](#differences-between-azurite-v3-and-azurite-v2)
    - [Architecture](#architecture)
    - [Server Code Generator](#server-code-generator)
    - [TypeScript](#typescript)
    - [Features Scope](#features-scope)
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

- Blob storage features align with Azure Storage API version 2025-11-05 (Refer to support matrix section below)
  - SharedKey/Account SAS/Service SAS/Public Access Authentications/OAuth
  - Get/Set Blob Service Properties
  - Create/List/Delete Containers
  - Create/Read/List/Update/Delete Block Blobs
  - Create/Read/List/Update/Delete Page Blobs
- Queue storage features align with Azure Storage API version 2025-11-05 (Refer to support matrix section below)
  - SharedKey/Account SAS/Service SAS/OAuth
  - Get/Set Queue Service Properties
  - Preflight Request
  - Create/List/Delete Queues
  - Put/Get/Peek/Update/Delete/Clear Messages
- Table storage features align with Azure Storage API version 2025-11-05 (Refer to support matrix section below)
  - SharedKey/Account SAS/Service SAS/OAuth
  - Create/List/Delete Tables
  - Insert/Update/Query/Delete Table Entities
- Features **NEW** on V3
  - Built with TypeScript and ECMA native promise and async features
  - New architecture based on TypeScript server generator. Leverage auto generated protocol layer, models, serializer, deserializer and handler interfaces from REST API swagger
  - Flexible structure and architecture, supports customizing handler layer implementation, persistency layer implementation, HTTP pipeline middleware injection
  - Detailed debugging log support, easy bug locating and reporting
  - Works with storage .Net SDK basic and advanced sample
  - SharedKey, AccountSAS, ServiceSAS, OAuth, Public Access authentication support
  - Keep updating with latest Azure Storage API version features (Refer to support matrix)

## Getting Started

Try with any of following ways to start an Azurite V3 instance.

### GitHub

After cloning source code, execute following commands to install and start Azurite V3.

```bash
npm ci
npm run build
npm install -g
azurite
```

### NPM

In order to run Azurite V3 you need Node.js installed on your system. Azurite works cross-platform on Windows, Linux, and OS X.
Azurite is compatible with the current Node.Js LTS Versions in support.

After installation you can install Azurite simply with npm which is the Node.js package management tool included with every Node.js installation.

```cmd
npm install -g azurite
```

Simply start it with the following command:

```cmd
azurite -s -l c:\azurite -d c:\azurite\debug.log
```

or,

```cmd
azurite --silent --location c:\azurite --debug c:\azurite\debug.log
```

This tells Azurite to store all data in a particular directory `c:\azurite`. If the `-l` option is omitted it will use the current working directory. You can also selectively start different storage services.

For example, to start blob service only:

```bash
azurite-blob -l path/to/azurite/workspace
```

Start queue service only:

```bash
azurite-queue -l path/to/azurite/workspace
```

Start table service only:

```bash
azurite-table -l path/to/azurite/workspace
```

### Visual Studio Code Extension

Azurite V3 can be installed from [Visual Studio Code extension market](https://marketplace.visualstudio.com/items?itemName=Azurite.azurite).

You can quickly start or close Azurite by clicking Azurite **status bar item** or following commands.

Extension supports following Visual Studio Code commands:

- `Azurite: Start` Start all Azurite services
- `Azurite: Close` Close all Azurite services
- `Azurite: Clean` Reset all Azurite services persistency data
- `Azurite: Start Blob Service` Start blob service
- `Azurite: Close Blob Service` Close blob service
- `Azurite: Clean Blob Service` Clean blob service
- `Azurite: Start Queue Service` Start queue service
- `Azurite: Close Queue Service` Close queue service
- `Azurite: Clean Queue Service` Clean queue service
- `Azurite: Start Table Service` Start table service
- `Azurite: Close Table Service` Close table service
- `Azurite: Clean Table Service` Clean table service

Following extension configurations are supported:

- `azurite.blobHost` Blob service listening endpoint, by default 127.0.0.1
- `azurite.blobPort` Blob service listening port, by default 10000
- `azurite.blobKeepAliveTimeout` Blob service keep alive timeout in seconds, by default 5
- `azurite.queueHost` Queue service listening endpoint, by default 127.0.0.1
- `azurite.queuePort` Queue service listening port, by default 10001
- `azurite.queueKeepAliveTimeout` Queue service keep alive timeout in seconds, by default 5
- `azurite.tableHost` Table service listening endpoint, by default 127.0.0.1
- `azurite.tablePort` Table service listening port, by default 10002
- `azurite.tableKeepAliveTimeout` Queue service keep alive timeout in seconds, by default 5
- `azurite.location` Workspace location folder path (can be relative or absolute). By default, in the VS Code extension, the currently opened folder is used. If launched from the command line, the current process working directory is the default. Relative paths are resolved relative to the default folder.
- `azurite.silent` Silent mode to disable access log in Visual Studio channel, by default false
- `azurite.debug` Output debug log into Azurite channel, by default false
- `azurite.loose` Enable loose mode which ignores unsupported headers and parameters, by default false
- `azurite.cert` Path to a PEM or PFX cert file. Required by HTTPS mode.
- `azurite.key` Path to a PEM key file. Required when `azurite.cert` points to a PEM file.
- `azurite.pwd` PFX cert password. Required when `azurite.cert` points to a PFX file.
- `azurite.oauth` OAuth oauthentication level. Candidate level values: `basic`.
- `azurite.skipApiVersionCheck` Skip the request API version check, by default false.
- `azurite.disableProductStyleUrl` Force parsing storage account name from request URI path, instead of from request URI host.
- `azurite.inMemoryPersistence` Disable persisting any data to disk. If the Azurite process is terminated, all data is lost.
- `azurite.extentMemoryLimit` When using in-memory persistence, limit the total size of extents (blob and queue content) to a specific number of megabytes. This does not limit blob, queue, or table metadata. Defaults to 50% of total memory.
- `azurite.disableTelemetry` Disable telemetry data collection of this Azurite execution. By default, Azurite will collect telemetry data to help improve the product.

### [DockerHub](https://hub.docker.com/_/microsoft-azure-storage-azurite)

#### Run Azurite V3 docker image

> Note. Find more docker images tags in <https://mcr.microsoft.com/v2/azure-storage/azurite/tags/list>

```bash
docker run -p 10000:10000 -p 10001:10001 -p 10002:10002 mcr.microsoft.com/azure-storage/azurite
```

`-p 10000:10000` will expose blob service's default listening port.
`-p 10001:10001` will expose queue service's default listening port.
`-p 10002:10002` will expose table service's default listening port.

Or just run blob service:

```bash
docker run -p 10000:10000 mcr.microsoft.com/azure-storage/azurite azurite-blob --blobHost 0.0.0.0
```

#### Run Azurite V3 docker image with customized persisted data location

```bash
docker run -p 10000:10000 -p 10001:10001 -v c:/azurite:/data mcr.microsoft.com/azure-storage/azurite
```

`-v c:/azurite:/data` will use and map host path `c:/azurite` as Azurite's workspace location.

#### Customize all Azurite V3 supported parameters for docker image

```bash
docker run -p 7777:7777 -p 8888:8888 -p 9999:9999 -v c:/azurite:/workspace mcr.microsoft.com/azure-storage/azurite azurite -l /workspace -d /workspace/debug.log --blobPort 7777 --blobHost 0.0.0.0 --blobKeepAliveTimeout 5 --queuePort 8888 --queueHost 0.0.0.0 --queueKeepAliveTimeout 5 --tablePort 9999 --tableHost 0.0.0.0 --tableKeepAliveTimeout 5 --loose --skipApiVersionCheck --disableProductStyleUrl --disableTelemetry
```

Above command will try to start Azurite image with configurations:

`-l //workspace` defines folder `/workspace` as Azurite's location path inside docker instance, while `/workspace` is mapped to `c:/azurite` in host environment by `-v c:/azurite:/workspace`

`-d //workspace/debug.log` enables debug log into `/workspace/debug.log` inside docker instance. `debug.log` will also mapped to `c:/azurite/debug.log` in host machine because of docker volume mapping.

`--blobPort 7777` makes Azurite blob service listen to port 7777, while `-p 7777:7777` redirects requests from host machine's port 7777 to docker instance.

`--blobHost 0.0.0.0` defines blob service listening endpoint to accept requests from host machine.

`--blobKeepAliveTimeout 5` blob service keep alive timeout in seconds

`--queuePort 8888` makes Azurite queue service listen to port 8888, while `-p 8888:8888` redirects requests from host machine's port 8888 to docker instance.

`--queueHost 0.0.0.0` defines queue service listening endpoint to accept requests from host machine.

`--queueKeepAliveTimeout 5` queue service keep alive timeout in seconds

`--tablePort 9999` makes Azurite table service listen to port 9999, while `-p 9999:9999` redirects requests from host machine's port 9999 to docker instance.

`--tableHost 0.0.0.0` defines table service listening endpoint to accept requests from host machine.

`--tableKeepAliveTimeout 5` table service keep alive timeout in seconds

`--loose` enables loose mode which ignore unsupported headers and parameters.

`--skipApiVersionCheck` skip the request API version check.

`--disableProductStyleUrl` force parsing storage account name from request URI path, instead of from request URI host.

`--azurite.disableTelemetry` disable telemetry data collection of this Azurite execution. By default, Azurite will collect telemetry data to help improve the product.

> If you use customized azurite parameters for docker image, `--blobHost 0.0.0.0`, `--queueHost 0.0.0.0` are required parameters.

> In above sample, you need to use **double first forward slash** for location and debug path parameters to avoid a [known issue](https://stackoverflow.com/questions/48427366/docker-build-command-add-c-program-files-git-to-the-path-passed-as-build-argu) for Git on Windows.

> Will support more release channels for Azurite V3 in the future.

#### Docker Compose

To run Azurite in Docker Compose, you can start with the following configuration:

```yml
---
version: "3.9"
services:
  azurite:
    image: mcr.microsoft.com/azure-storage/azurite
    container_name: "azurite"
    hostname: azurite
    restart: always
    ports:
      - "10000:10000"
      - "10001:10001"
      - "10002:10002"
```

### NuGet

_Releasing Azurite V3 to NuGet is under investigation._

### Visual Studio

_Integrate Azurite with Visual Studio is under investigation._

## Supported Command Line Options

### Listening Host Configuration

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

### Listening Port Configuration

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

### Workspace Path Configuration

Optional. Azurite V3 needs to persist metadata and binary data to local disk during execution.

You can provide a customized path as the workspace location, or by default, Current process working directory will be used.

```cmd
-l c:\azurite
--location c:\azurite
```

### Access Log Configuration

Optional. By default Azurite will display access log in console. **Disable** it by:

```cmd
-s
--silent
```

### Debug Log Configuration

Optional. Debug log includes detailed information on every request and exception stack traces.
Enable it by providing a valid local file path for the debug log destination.

```cmd
-d path/debug.log
--debug path/debug.log
```

### Loose Mode Configuration

Optional. By default Azurite will apply strict mode. Strict mode will block unsupported request headers or parameters. **Disable** it by enabling loose mode:

```cmd
-L
--loose
```

### Certificate Configuration (HTTPS)

Optional. By default Azurite will listen on HTTP protocol. Provide a PEM or PFX certificate file path to enable HTTPS mode:

```cmd
--cert path/server.pem
```

When `--cert` is provided for a PEM file, must provide corresponding `--key`.

```cmd
--key path/key.pem
```

When `--cert` is provided for a PFX file, must provide corresponding `--pwd`

```cmd
--pwd pfxpassword
```

### OAuth Configuration

Optional. By default, Azurite doesn't support OAuth and bearer token. Enable OAuth authentication for Azurite by:

```
--oauth basic
```

> Note. OAuth requires HTTPS endpoint. Make sure HTTPS is enabled by providing `--cert` parameter along with `--oauth` parameter.

Currently, Azurite supports following OAuth authentication levels:

#### Basic

In basic level, `--oauth basic`, Azurite will do basic authentication, like validating incoming bearer token, checking issuer, audience, expiry. But Azurite will NOT check token signature and permission.

### Skip API Version Check

Optional. By default Azurite will check the request API version is valid API version. Skip the API version check by:

```cmd
--skipApiVersionCheck
```

### Disable Product Style Url

Optional. When using FQDN instead of IP in request URI host, by default Azurite will parse storage account name from request URI host. Force parsing storage account name from request URI path by:

```cmd
--disableProductStyleUrl
```

### Disable Telemetry Collection

Optional. By default, Azurite will collect telemetry data to help improve the product. Disable telemetry data collection of this Azurite execution by:

```cmd
--disableTelemetry
```

### Use in-memory storage

Optional. Disable persisting any data to disk and only store data in-memory. If the Azurite process is terminated, all
data is lost. By default, LokiJS persists blob and queue metadata to disk and content to extent files. Table storage
persists all data to disk. This behavior can be disabled using this option. This setting is rejected when the SQL based
metadata implementation is enabled (via `AZURITE_DB`). This setting is rejected when the `--location` option is
specified.

```cmd
--inMemoryPersistence
```

By default, the in-memory extent store (for blob and queue content) is limited to 50% of the total memory on the host
machine. This is evaluated to using [`os.totalmem()`](https://nodejs.org/api/os.html#ostotalmem). This limit can be
overridden using the `--extentMemoryLimit <megabytes>` option. There is no restriction on the value specified for this
option but virtual memory may be used if the limit exceeds the amount of available physical memory as provided by the
operating system. A high limit may eventually lead to out of memory errors or reduced performance.

As blob or queue content (i.e. bytes in the in-memory extent store) is deleted, the memory is not freed immediately.
Similar to the default file-system based extent store, both the blob and queue service have an extent garbage collection
(GC) process. This process is in addition to the standard Node.js runtime GC. The extent GC periodically detects unused
extents and deletes them from the extent store. This happens on a regular time period rather than immediately after
the blob or queue REST API operation that caused some content to be deleted. This means that process memory consumed by
the deleted blob or queue content will only be released after both the extent GC and the runtime GC have run. The extent
GC will remove the reference to the in-memory byte storage and the runtime GC will free the unreferenced memory some
time after that. The blob extent GC runs every 10 minutes and the queue extent GC runs every 1 minute.

The queue and blob extent storage count towards the same limit. The `--extentMemoryLimit` setting is rejected when
`--inMemoryPersistence` is not specified. LokiJS storage (blob and queue metadata and table data) does
not contribute to this limit and is unbounded which is the same as without the `--inMemoryPersistence` option.

```cmd
--extentMemoryLimit <megabytes>
```

This option is rejected when `--inMemoryPersistence` is not specified.

When the limit is reached, write operations to the blob or queue endpoints which carry content will fail with an `HTTP
409` status code, a custom storage error code of `MemoryExtentStoreAtSizeLimit`, and a helpful error message.
Well-behaved storage SDKs and tools will not a retry on this failure and will return a related error message. If this
error is met, consider deleting some in-memory content (blobs or queues), raising the limit, or restarting the Azurite
server thus resetting the storage completely.

Note that if many hundreds of megabytes of content (queue message or blob content) are stored in-memory, it can take
noticeably longer than usual for the process to terminate since all the consumed memory needs to be released.

### Command Line Options Differences between Azurite V2

Azurite V3 supports SharedKey, Account Shared Access Signature (SAS), Service SAS, OAuth, and Public Container Access authentications, you can use any Azure Storage SDKs or tools like Storage Explorer to connect Azurite V3 with any authentication strategy.

An option to bypass authentication is **NOT** provided in Azurite V3.

## Supported Environment Variable Options

When starting Azurite from npm command line `azurite` or docker image, following environment variables are supported for advanced customization.

### Customized Storage Accounts & Keys

Azurite V3 allows customizing storage account names and keys by providing environment variable `AZURITE_ACCOUNTS` with format `account1:key1[:key2];account2:key1[:key2];...`.

For example, customize one storage account which has only one key:

```cmd
set AZURITE_ACCOUNTS=account1:key1
```

Or customize multi storage accounts and each has 2 keys:

```cmd
set AZURITE_ACCOUNTS=account1:key1:key2;account2:key1:key2
```

Azurite will refresh customized account name and key from environment variable every minute by default. With this feature, we can dynamically rotate account key, or add new storage accounts on the air without restarting Azurite instance.

> Note. Default storage account `devstoreaccount1` will be disabled when providing customized storage accounts.

> Note. The account keys must be base64 encoded string.

> Note. Should update connection string accordingly if using customized account name and key.

> Note. Use `export` keyword to set environment variable in Linux like environment, `set` in Windows.

> Note. When changing storage account name, keep these rules in mind as same as [Azure Storage Account](https://learn.microsoft.com/en-us/azure/storage/common/storage-account-overview#storage-account-name):
>
> - Storage account names must be between 3 and 24 characters in length and may contain numbers and lowercase letters only.

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

Azurite natively supports HTTPS with self-signed certificates via the `--cert` and `--key`/`--pwd` options. You have two certificate type options: PEM or PFX. PEM certificates are split into "cert" and "key" files. A PFX certificate is a single file that can be assigned a password.

### PEM

#### Generate PEM Certificate and Key

You have a few options to generate PEM certificate and key files. We'll show you how to use [mkcert](https://github.com/FiloSottile/mkcert) and [OpenSSL](https://www.openssl.org/).

##### mkcert

[mkcert](https://github.com/FiloSottile/mkcert) is a utility that makes the entire self-signed certificate process much easier because it wraps a lot of the complex commands that you need to manually execute with other utilities.

###### Generate Certificate and Key with mkcert

1. Install mkcert: <https://github.com/FiloSottile/mkcert#installation>. We like to use choco `choco install mkcert`, but you can install with any mechanism you'd like.
2. Run the following commands to install the Root CA and generate a cert for Azurite.

```bash
mkcert -install
mkcert 127.0.0.1
```

That will create two files. A certificate file: `127.0.0.1.pem` and a key file: `127.0.0.1-key.pem`.

###### Start Azurite with HTTPS and PEM

Then you start Azurite with that cert and key.

```bash
azurite --cert 127.0.0.1.pem --key 127.0.0.1-key.pem
```

If you start Azurite with docker, you need to map the folder contains the cert and key files to docker.
In following example, the local folder c:/azurite contains the cert and key files, and map it to /workspace on docker.

```bash
docker run -p 10000:10000 -p 10001:10001 -p 10002:10002 -v c:/azurite:/workspace  mcr.microsoft.com/azure-storage/azurite azurite --blobHost 0.0.0.0  --queueHost 0.0.0.0 --tableHost 0.0.0.0 --cert /workspace/127.0.0.1.pem --key /workspace/127.0.0.1-key.pem
```

##### OpenSSL

[OpenSSL](https://www.openssl.org/) is a TLS/SSL toolkit. You can use it to generate certificates. It is more involved than mkcert, but has more options.

###### Install OpenSSL on Windows

1. Download and install the OpenSSL v1.1.1a+ EXE from <http://slproweb.com/products/Win32OpenSSL.html>
2. Set the following environment variables

```bash
set OPENSSL_CONF=c:\OpenSSL-Win32\bin\openssl.cfg
set Path=%PATH%;c:\OpenSSL-Win32\bin
```

###### Generate Certificate and Key

Execute the following command to generate a cert and key with [OpenSSL](https://www.openssl.org/).

```bash
openssl req -newkey rsa:2048 -x509 -nodes -keyout key.pem -new -out cert.pem -sha256 -days 365 -addext "subjectAltName=IP:127.0.0.1" -subj "/C=CO/ST=ST/L=LO/O=OR/OU=OU/CN=CN"
```

The `-subj` values are required, but do not have to be valid. The `subjectAltName` must contain the Azurite IP address.

###### Add Certificate to Trusted Root Store

You then need to add that certificate to the Trusted Root Certification Authorities. This is required to work with Azure SDKs and Storage Explorer.

Here's how to do that on Windows:

```bash
certutil –addstore -enterprise –f "Root" cert.pem
```

#### Start Azurite with HTTPS and PEM

Then you start Azurite with that cert and key.

```bash
Azurite --cert cert.pem --key key.pem
```

NOTE: If you are using the Azure SDKs, then you will also need to pass the `--oauth basic` option.

### PFX

#### Generate PFX Certificate

You first need to generate a PFX file to use with Azurite.

You can use the following command to generate a PFX file with `dotnet dev-certs`, which is installed with the [.NET Core SDK](https://dotnet.microsoft.com/download).

```bash
dotnet dev-certs https --trust -ep cert.pfx -p <password>
```

> Storage Explorer does not currently work with certificates produced by `dotnet dev-certs`. While you can use them for Azurite and Azure SDKs, you won't be able to access the Azurite endpoints with Storage Explorer if you are using the certs created with dotnet dev-certs. We are tracking this issue on GitHub here: <https://github.com/microsoft/AzureStorageExplorer/issues/2859>

#### Start Azurite with HTTPS and PFX

Then you start Azurite with that cert and password.

```bash
azurite --cert cert.pfx --pwd pfxpassword
```

NOTE: If you are using the Azure SDKs, then you will also need to pass the `--oauth basic` option.

#### Start Azurite

## Usage with Azure Storage SDKs or Tools

### Default Storage Account

Azurite V3 provides support for a default storage account as General Storage Account V2 and associated features.

- Account name: `devstoreaccount1`
- Account key: `Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==`

> Note. Besides SharedKey authentication, Azurite V3 supports account, OAuth, and service SAS authentication. Anonymous access is also available when container is set to allow public access.

### Customized Storage Accounts & Keys

As mentioned by above section. Azurite V3 allows customizing storage account names and keys by providing environment variable `AZURITE_ACCOUNTS` with format `account1:key1[:key2];account2:key1[:key2];...`. Account keys must be base64 encoded string.

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

#### Storage Explorer with Azurite HTTP

Connect to Azurite by click "Add Account" icon, then select "Attach to a local emulator" and click "Connect".

#### Storage Explorer with Azurite HTTPS

By default Storage Explorer will not open an HTTPS endpoint that uses a self-signed certificate. If you are running Azurite with HTTPS, then you are likely using a self-signed certificate. Fortunately, Storage Explorer allows you to import SSL certificates via the Edit -> SSL Certificates -> Import Certificates dialog.

##### Import Certificate to Storage Explorer

1. Find the certificate on your local machine.
   - **OpenSSL**: You can find the PEM file at the location you created in the [HTTPS Setup](#https-setup) section above.
   - **mkcert**: You need to import the RootCA.pem file, which can be found by executing this command in the terminal: `mkcert -CAROOT`. For mkcert, you want to import the RootCA.pem file, not the certificate file you created.
   - **dotnet dev-certs**: Storage Explorer doesn't currently work with certs produced by `dotnet dev-certs`. We are tracking this issue on GitHub here: <https://github.com/microsoft/AzureStorageExplorer/issues/2859>
2. Open Storage Explorer -> Edit -> SSL Certificates -> Import Certificates and import your certificate.

If you do not set this, then you will get the following error:

```
unable to verify the first certificate
```

or

```
self signed certificate in chain
```

##### Add Azurite via HTTPS Connection String

Follow these steps to add Azurite HTTPS to Storage Explorer:

1. Right click on Local & Attached -> Storage Accounts and select "Connect to Azure Storage...".
2. Select "Use a connection string" and click Next.
3. Enter a name, i.e Azurite.
4. Enter the [HTTPS connection string](#https-connection-strings) from the previous section of this document and click Next.

You can now explore the Azurite HTTPS endpoints with Storage Explorer.

## Workspace Structure

Following files or folders may be created when initializing Azurite in selected workspace location.

- `azurite_db_blob.json` Metadata file used by Azurite blob service. (No when starting Azurite against external database)
- `azurite_db_blob_extent.json` Extent metadata file used by Azurite blob service. (No when starting Azurite against external database)
- `blobstorage` Persisted binary data by Azurite blob service.
- `azurite_db_queue.json` Metadata file used by Azurite queue service. (No when starting Azurite against external database)
- `azurite_db_queue_extent.json` Extent metadata file used by Azurite queue service. (No when starting Azurite against external database)
- `queuestorage` Persisted binary data by Azurite queue service.
- `azurite_db_table.json` Metadata file used by Azurite table service.

> Note. Delete above files and folders and restart Azurite to clean up Azurite. It will remove all data stored in Azurite!!

## Differences between Azurite and Azure Storage

Because Azurite runs as a local instance for persistent data storage, there are differences in functionality between Azurite and an Azure storage account in the cloud.

### Storage Accounts

You could enable multiple accounts by setting up environment variable `AZURITE_ACCOUNTS`. See the [section](#customized-storage-accounts--keys-1) above.

Optionally, you could modify your hosts file, to access accounts with production-style URL. See section below.

### Endpoint & Connection URL

The service endpoints for Azurite are different from those of an Azure storage account. The difference is because Azurite runs on local computer, and normally, no DNS resolves address to local.

When you address a resource in an Azure storage account, use the following scheme. The account name is part of the URI host name, and the resource being addressed is part of the URI path:

```
<http|https>://<account-name>.<service-name>.core.windows.net/<resource-path>
```

For example, the following URI is a valid address for a blob in an Azure storage account:

```
https://myaccount.blob.core.windows.net/mycontainer/myblob.txt
```

#### IP-style URL

However, because Azurite runs on local computer, it use IP-style URI by default, and the account name is part of the URI path instead of the host name. Use the following URI format for a resource in Azurite:

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

> Note. When use Production-style URL to access Azurite, by default the account name should be the host name in FQDN, like "<http://devstoreaccount1.blob.localhost:10000/container>". To use Production-style URL with account name in URL path, like "<http://foo.bar.com:10000/devstoreaccount1/container>", please start Azurite with `--disableProductStyleUrl`.

> Note. If use "host.docker.internal" as request URI host, like "<http://host.docker.internal:10000/devstoreaccount1/container>", Azurite will always get account name from request URI path, not matter Azurite start with `--disableProductStyleUrl` or not.

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

Azurite V3 selected TypeScript as its programming language, as this facilitates broad collaboration, whilst also ensuring quality.

### Features Scope

Legacy Azurite V2 supports Azure Storage Blob, Queue and Table services.
Azurite V3 currently only supports Azure Storage blob service. Queue service is supported after V3.2.0-preview.
Table service support is currently under discussion.

Azurite V3 supports features from Azure Storage API version 2023-01-03, and will maintain parity with the latest API versions, in a more frequent update frequency than legacy Azurite V2.

## TypeScript Server Code Generator

Azurite V3 leverages a TypeScript Node.js Server Code Generator to generate the majority of code from Azure Storage REST APIs swagger specification.
Currently, the generator project is private, under development and only used by Azurite V3.
We have plans to make the TypeScript server generator public after Azurite V3 releases.
All the generated code is kept in `generated` folder, including the generated middleware, request and response models.

## Support Matrix

Latest release targets **2025-11-05** API version **blob** service.

Detailed support matrix:

- Supported Vertical Features
  - CORS and Preflight
  - SharedKey Authentication
  - OAuth authentication
  - Shared Access Signature Account Level
  - Shared Access Signature Service Level (Not support response header override in service SAS)
  - Container Public Access
  - Blob Tags (preview)
- Supported REST APIs
  - List Containers
  - Set Service Properties
  - Get Service Properties
  - Get Stats
  - Get Account Information
  - Create Container
  - Get Container Properties
  - Get Container Metadata
  - Set Container Metadata
  - Get Container ACL
  - Set Container ACL
  - Delete Container
  - Lease Container
  - List Blobs
  - Put Blob (Create append blob is not supported)
  - Get Blob
  - Get Blob Properties
  - Set Blob Properties
  - Get Blob Metadata
  - Set Blob Metadata
  - Create Append Blob, Append Block
  - Lease Blob
  - Snapshot Blob
  - Copy Blob (Only supports copy within same Azurite instance)
  - Abort Copy Blob (Only supports copy within same Azurite instance)
  - Copy Blob From URL (Only supports copy within same Azurite instance, only on Loki)
  - Access control based on conditional headers
- Following features or REST APIs are NOT supported or limited supported in this release (will support more features per customers feedback in future releases)

  - SharedKey Lite
  - Static Website
  - Soft delete & Undelete Container
  - Soft delete & Undelete Blob
  - Incremental Copy Blob
  - Blob Query
  - Blob Versions
  - Blob Last Access Time
  - Concurrent Append
  - Blob Expiry
  - Object Replication Service
  - Put Blob From URL
  - Version Level Worm
  - Sync copy blob by access source with oauth
  - Encryption Scope
  - Get Page Ranges Continuation Token
  - Blob Immutability Policy and Legal Hold

Latest version supports for **2025-11-05** API version **queue** service.
Detailed support matrix:

- Supported Vertical Features
  - SharedKey Authentication
  - Shared Access Signature Account Level
  - Shared Access Signature Service Level
  - OAuth authentication
- Supported REST APIs
  - List Queues
  - Set Service Properties
  - Get Service Properties
  - Get Stats
  - Preflight Queue Request
  - Create Queue
  - Get Queue Metadata
  - Set Queue Metadata
  - Get Queue ACL
  - Set Queue ACL
  - Delete Queue
  - Put Message
  - Get Messages
  - Peek Messages
  - Delete Message
  - Update Message
  - Clear Message
- Following features or REST APIs are NOT supported or limited supported in this release (will support more features per customers feedback in future releases)
  - SharedKey Lite

Latest version supports for **2025-11-05** API version **table** service (preview).
Detailed support matrix:

- Supported Vertical Features
  - SharedKeyLite Authentication
  - SharedKey Authentication
  - Shared Access Signature Account Level
  - Shared Access Signature Service Level
- Supported REST APIs
  - List Tables
  - Create Table
  - Delete Table
  - Update Entity
  - Query Entities
  - Merge Entity
  - Delete Entity
  - Insert Entity
  - Batch
- Following features or REST APIs are NOT supported or limited supported in this release (will support more features per customers feedback in future releases)
  - Set Service Properties
  - Get Service Properties
  - Get Table ACL
  - Set Table ACL
  - Get Stats
  - CORS
  - Batch Transaction
  - Query with complex conditions
  - OAuth

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
