# Azurite
[![npm version](https://badge.fury.io/js/azurite.svg)](https://badge.fury.io/js/azurite)
[![license](https://img.shields.io/github/license/mashape/apistatus.svg?maxAge=2592000)]()
[![Build Status](https://travis-ci.org/Azure/Azurite.svg?branch=master)](https://travis-ci.org/Azure/Azurite)

A lightweight server clone of Azure Blob, Queue, and Table Storage that simulates most of the commands supported by it with minimal dependencies.

# Important Update on Azurite Direction & Future Work - Legacy Branch

Dear Azurite community, many thanks for your interest and support.  
We thought we might be able to reduce some of our testing overhead by incorporating the Azure Storage Node tests in the dev pipeline, but that just showed us how far we really had to go.

We were struggling to maintain parity with our APIs, community contributions were growing, as was our number of issues.  

**To fix this**, we have created a more easily maintainable architecture for Azurite, using Typescript and automatically generated interfaces.

Please use the v3 version unless you need cross platform table storage emulation, which is currently only available in v2, or via the [Cosmos emulator in Windows](https://docs.microsoft.com/en-us/azure/cosmos-db/local-emulator). 

Contributors and maintainers to v3 can focus on emulation and simulation of storage behaviour, rather than reverse engineering our APIs and API documentation.  


# Installation and Usage
## NPM
In order to run Azurite you need [Node.js](https://nodejs.org/) >= 6.0 installed on your system. Azurite works cross-platform on Windows, Linux, and OS X. 

After installation you can install Azurite simply with `npm` which is Node.js package management tool and which is included with every Node.js installation.

`$ npm install -g azurite`

## Running Azurite

Simply start it with the following command: 

`$ azurite -l path/to/localfolder`

This tells Azurite to store all data in a particular directory. If the `-l` option is ommitted it will use the current working directory. This also will start both blob storage and queue storage emulation in two different processes.
You can also selectively start the different storage emulators.

For Blob Storage Emulator only:

`$ azurite-blob -l path/to/azurite/workspace`

For Queue Storage Emulator only:

`$ azurite-queue`

For Table Storage Emulator only:

`$ azurite-table -l path/to/azurite/workspace`


## Nuget
Azurite is also available as Nuget package at [https://www.nuget.org/packages/Azurite/](https://www.nuget.org/packages/Azurite/).
You can install it via the [Package Manager Console](https://docs.nuget.org/docs/start-here/using-the-package-manager-console) with the following command:
```bash
PM> Install-Package Azurite
```
This will install Azurite to your current project and also immediately start it in a dedicated console window. Note that you do not need to install Node.js since Azurite is packaged into
a single self-contained executable, thanks to [pkg](https://www.npmjs.com/package/pkg).

## Docker image

### Pulling from Docker Hub
Azurite v2 is not available on Docker Hub.  
You must build the docker image yourself.

### Build the Docker image 
To build the Docker image yourself, execute the following:
```bash
$ docker build -t myazurite/azurite .
```

### Run the Docker image
To run the Docker image, execute the following command:
```bash
$ docker run -d -t -p 10002:10002 -v /path/to/folder:/opt/azurite/folder myazurite/azurite
```
The expectation is that Azureite v2 is only being used for table storage, and only 1 port is being forwarded to the docker container for this purpose.

#### Configure the executable when running the container
By default, the container starts all services available (currently blob, queue, and table).
Using the environment variable `executable`, specific executables can be specifed:

 * `blob` Start the Blob Storage Emulator only
 * `queue` Start the Azure Queue Storage Emulator only
 * `table` Start the Azure Table Storage Emulator only

##### Usage example:
```bash
$ docker run -e executable=blob -d -t -p 10000:10000 -v /path/to/folder:/opt/azurite/folder myazurite/azurite
```

## Usage with Azure Cross-Platform CLI 2.0

To perform blob storage operations using the 2.0 Azure cross-platform CLI, you need to operate with the
appropriate connection string. The values within are based on the hardcoded Azure Storage Emulator values.

Example command to create a container:

```shell
$ az storage container create --name 'test' --connection-string 'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;'

{
  "created": true
}
```

## Shared Key Credential

The Shared Key Credential account and access key is 

```
ACCOUNT_NAME: devstoreaccount1
ACCOUNT_ACCESS_KEY: Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==
```

## Current List of Command Line Options

```
-a
``` 
Enables sharedkey authentication check
```
-l c:\tmp\emulatorPath
--location c:\tmp\emulatorPath
```
Allows the specification of a path
```
--blobPort 101000
```
Sets the TCP Port for blob storage to the value following the argument.
```
--queuePort 10001
```
Sets the TCP Port for queue storage to the value following the argument.
```
--tablePort 10002
```
Sets the TCP Port for table storage to the value following the argument.



# Contributions
## What do I need to know to help?
If you are interested in making a code contribution and would like to learn more about the technologies that we use, check out the list below.

- Azurite runs on [Node.js](https://nodejs.org/). If you never worked with this technology before make sure to get yourself familiar with it. There are many [good tutorials](https://blog.risingstack.com/node-hero-tutorial-getting-started-with-node-js/) out there along with a [comprehensive API documentation](https://nodejs.org/dist/latest-v6.x/docs/api/) that will get you up to speed quickly! We are currently coding against Node.js v8.9.4 LTS 
- Azurite exposes its REST-based API via [Express.js](https://expressjs.com/) which is a "fast, unopinionated, minimalist web framework for Node.js. 
- Azurite uses [LokiJS](http://lokijs.org) which is an in-memory data store with persistence. It serves as our central database to store metadata (names, properties, leases, etc.) about all objects put into Azurite.
- Azurite makes heavy use of [Bluebird](http://bluebirdjs.com/docs/getting-started.html) which is a fully featured promises library with unmatched performance.  

## What TODOs are there?
We are using a combination of community feedback, and the Azure Storage Node package tests to validate  Azurite's support of the [Official Blob Storage REST API Specification](https://docs.microsoft.com/rest/api/storageservices/blob-service-rest-api).  
We shall create issues based on failing tests to help direct and prioritize our development efforts.  
See also section below: [API Support](https://github.com/Azure/Azurite/#api-support).

Current bugs that need to be fixed are listed at our [issues site on Github](https://github.com/Azure/Azurite/issues) and tagged with a red label `bug`.

Issues which we think might  be a good place for newcomers to start, are tagged with [**"good first issue"**](https://github.com/Azure/Azurite/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

Details on how to setup tests with the Azure Storage submodule, can be found under [Testing with Azure Storage Node](./doc/azure-storage-node_tdd.md).  

## Need Help?
Be sure to check out the Microsoft Azure Developer Forums on MSDN or the Developer Forums on Stack Overflow if you have trouble with the provided code.

## Contribute Code or Provide Feedback
If you would like to become an active contributor to this project please follow the instructions provided in Azure Projects [Contribution Guidelines](https://azure.github.io/guidelines/).

If you encounter any bugs with the library please file an issue in the [Issues](https://github.com/Azure/Azurite/issues) section of the project.

When sending pull requests, please send **non-breaking PRs** to the dev branch and breaking changes to the **dev_breaking** branch. Please do not make PRs against master.

- **Please include a Unit or Integration test with any code submission, this is a significant help when validating changes and helps reduce the time we need to spend on pull requests.**  

## Where can I go for help?

If you need help, you can ask questions directly at our [issues site on Github](https://github.com/Azure/Azurite/issues).  
Alternatively, check out the following links:  
  
[Azure Developer Center](https://azure.microsoft.com/en-us/develop/)  
[Azure Storage Service](https://azure.microsoft.com/en-us/documentation/services/storage/)  
[Azure Storage Team Blog](https://blogs.msdn.com/b/windowsazurestorage/)  

# API Support
Currently, Azurite only supports the [Blob Storage APIs](https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/blob-service-rest-api), the [Queue Storage API](https://docs.microsoft.com/en-us/rest/api/storageservices/queue-service-rest-api), and the [Table Storage API](https://docs.microsoft.com/en-us/rest/api/storageservices/table-service-rest-api).  
Support for Azure Storage Files is planned, but currently not available. 

The Standard Emulator Connection String is the same as required by [Microsoft's Official Storage Emulator](https://go.microsoft.com/fwlink/?LinkId=717179):

`BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;`

`QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;`

`TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;`


## Blob Storage - API Implementation Status
All DONE except:
- Account SAS Support [TODO]  
See [https://docs.microsoft.com/en-us/rest/api/storageservices/constructing-an-account-sas](https://docs.microsoft.com/en-us/rest/api/storageservices/constructing-an-account-sas) for specification

- Get Blob Service Stats [TODO]  
Retrieves statistics related to replication for the Blob service. This operation is only available on the secondary location endpoint when read-access geo-redundant replication is enabled for the storage account.

- Set Blob Tier [TODO]
The Set Blob Tier operation sets the tier on a blob.

## Queue Storage - API Implementation Status
All DONE.

## Table Storage - API Implementation Status
ALL DONE except:
- Get Table ACL [TODO]
- Set Table ACL [TODO]
- Entity Group Transaction (Batch Operation) [TODO]

