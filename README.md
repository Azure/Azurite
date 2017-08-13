# Azurite
[![npm version](https://badge.fury.io/js/azurite.svg)](https://badge.fury.io/js/azurite)
[![license](https://img.shields.io/github/license/mashape/apistatus.svg?maxAge=2592000)]()
[![Build Status](https://travis-ci.org/arafato/azurite.svg?branch=master)](https://travis-ci.org/arafato/azurite)

A lightweight server clone of Azure Blob Storage that simulates most of the commands supported by it with minimal dependencies.

# Installation and Usage
## NPM
In order to run Azurite you need [Node.js](https://nodejs.org/) >= 6.0 installed on your system. Azurite works cross-platform on Windows, Linux, and OS X. 

After installation you can install Azurite simply with `npm` which is Node.js package management tool and which is included with every Node.js installation.

`$ npm install -g azurite`

Then simply start it with the following command: 

`$ azurite -l path/to/localfolder`

This tells Azurite to store all data in a particular directory. If the `-l` option is ommitted it will use the current working directory.

## Nuget
Azurite is also available as Nuget package at [https://www.nuget.org/packages/Azurite/](https://www.nuget.org/packages/Azurite/).
You can install it via the [Package Manager Console](https://docs.nuget.org/docs/start-here/using-the-package-manager-console) with the following command:
```bash
PM> Install-Package Azurite
```
This will install Azurite to your current project and also immediately start it in a dedicated console window.

## Docker image
### Build the Docker image
To build the Docker image, execute the following:
```bash
docker build -t arafato/azurite .
```

### Run the Docker image
To run the Docker image, execute the following command:
```bash
docker run -d -t -p 10000:10000 -v /path/to/folder:/opt/azurite/folder arafato/azurite
```

# Contributions
## What do I need to know to help?
If you are interested in making a code contribution and would like to learn more about the technologies that we use, check out the list below.

- Azurite runs on [Node.js](https://nodejs.org/). If you never worked with this technology before make sure to get yourself familiar with it. There are many [good tutorials](https://blog.risingstack.com/node-hero-tutorial-getting-started-with-node-js/) out there along with a [comprehensive API documentation](https://nodejs.org/dist/latest-v6.x/docs/api/) that will get you up to speed quickly! We are currently coding against Node.js v6.10.x LTS 
- Azurite exposes its REST-based API via [Express.js](https://expressjs.com/) which is a "fast, unopinionated, minimalist web framework for Node.js. 
- Azurite uses [LokiJS](http://lokijs.org) which is an in-memory data store with persistence. It serves as our central database to store metadata (names, properties, leases, etc.) about all objects put into Azurite.
- Azurite makes heavy use of [Bluebird](http://bluebirdjs.com/docs/getting-started.html) which is a fully featured promises library with unmatched performance.  

## What TODOs are there?
The current status of Azurite's support of the [Official Blob Storage REST API Specification](https://docs.microsoft.com/rest/api/storageservices/blob-service-rest-api) is listed in below section [Blob Storage - API Implementation Status](https://github.com/arafato/azurite/#blob-storage---api-implementation-status). Features that are still unimplemented are marked with `[TODO]`. Completed features are marked with `[DONE]`.

Current bugs that need to be fixed are listed at our [issues site on Github](https://github.com/arafato/azurite/issues) and tagged with a red label `bug`.

## How do I make a contribution?

Never made an open source contribution before? Wondering how contributions work in Azurite? Here's a quick rundown!

1. Find an issue that you are interested in addressing or a feature that you would like to add.

2. Fork the Azurite repository to your local GitHub organization. This means that you will have a copy of the repository under `your-GitHub-username/azurite`.

3. Clone the repository to your local machine using git clone `https://github.com/github-username/azurite.git`.

4. Create a new branch for your fix using `git checkout -b branch-name-here`.
Make the appropriate changes for the issue you are trying to address or the feature that you want to add.

5. Use `git add insert-paths-of-changed-files-here` to add the file contents of the changed files to the "snapshot" git uses to manage the state of the project, also known as the index.

6. Use `git commit -m "Insert a short message of the changes made here"` to store the contents of the index with a descriptive message.

7. Push the changes to the remote repository using `git push origin branch-name-here`.

8. Submit a pull request to the upstream repository.
Title the pull request with a short description of the changes made and the issue or bug number associated with your change. For example, you can title an issue like so "Added more log outputting to resolve #4352".
In the description of the pull request, explain the changes that you made, any issues you think exist with the pull request you made, and any questions you have for the maintainer. It's OK if your pull request is not perfect (no pull request is), the reviewer will be able to help you fix any problems and improve it!

9. Wait for the pull request to be reviewed by a maintainer.
Make changes to the pull request if the reviewing maintainer recommends them.

10. Celebrate your success after your pull request is merged!

## Where can I go for help?
If you need help, you can ask questions directly at our [issues site on Github](https://github.com/arafato/azurite/issues).

# API Support
Currently, Azurite only supports the [Blob Storage APIs](https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/blob-service-rest-api). Support for Azure Queues and Azure Files is planned, but currently not available. 

The Standard Emulator Connection String is the same as required by [Microsoft's Official Storage Emulator](https://go.microsoft.com/fwlink/?LinkId=717179):

`BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;`


## Blob Storage - API Implementation Status
- List Containers [DONE]  
  Lists all of the containers in a storage account.
Markers are not supported yet.

- Account SAS Support [TODO]  
See [https://docs.microsoft.com/en-us/rest/api/storageservices/constructing-an-account-sas](https://docs.microsoft.com/en-us/rest/api/storageservices/constructing-an-account-sas) for specification

- Blob Service SAS Support [TODO]  
See [https://docs.microsoft.com/en-us/rest/api/storageservices/constructing-an-account-sas](https://docs.microsoft.com/en-us/rest/api/storageservices/constructing-an-account-sas) for specification

- Set Blob Service Properties [TODO]  
  Sets the properties of the Blob service, including logging and metrics settings, and the default service version.

- Get Blob Service Properties  [TODO]
Gets the properties of the Blob service, including logging and metrics settings, and the default service version.

- Preflight Blob Request [TODO]  
Queries the Cross-Origin Resource Sharing (CORS) rules for the Blob service prior to sending the actual request.

- Get Blob Service Stats [TODO]  
Retrieves statistics related to replication for the Blob service. This operation is only available on the secondary location endpoint when read-access geo-redundant replication is enabled for the storage account.

- Create Container [DONE]   
Creates a new container in a storage account.

- Get Container Properties [DONE]  
Returns all user-defined metadata and system properties of a container.

- Get Container Metadata [DONE]  
Returns only user-defined metadata of a container.

- Set Container Metadata [DONE]  
Sets user-defined metadata of a container.

- Get Container ACL [DONE]  
Gets the public access policy and any stored access policies for the container.

- Set Container ACL [DONE]  
Sets the public access policy and any stored access policies for the container.

- Lease Container [DONE]  
Establishes and manages a lock on a container for delete operations.

- Delete Container [DONE]  
Deletes the container and any blobs that it contains.

- List Blobs [DONE]  
Lists all of the blobs in a container.

- Put Blob [DONE]  
Creates a new blob or replaces an existing blob within a container.

- Get Blob [DONE]  
Block Blobs only.
Reads or downloads a blob from the Blob service, including its user-defined metadata and system properties.

- Get Blob Properties [DONE]  
Returns all system properties and user-defined metadata on the blob.

- Set Blob Properties [DONE]  
Sets system properties defined for an existing blob.

- Get Blob Metadata [DONE]  
Retrieves all user-defined metadata of an existing blob or snapshot.

- Set Blob Metadata [DONE]  
Sets user-defined metadata of an existing blob.

- Delete Blob [DONE]  
Marks a blob for deletion.

- Lease Blob [DONE]  
Establishes and manages a lock on write and delete operations. To delete or write to a locked blob, a client must provide the lease ID.

- Snapshot Blob [DONE]  
Creates a read-only snapshot of a blob.

- Copy Blob [TODO]  
Copies a source blob to a destination blob in this storage account or in another storage account.

- Abort Copy Blob [TODO]  
Aborts a pending Copy Blob operation, and leaves a destination blob with zero length and full metadata.

- Put Block [DONE]  
Block blobs only. 	
Creates a new block to be committed as part of a block blob.

- Put Block List [DONE]  
Block blobs only.
Commits a blob by specifying the set of block IDs that comprise the block blob.

- Get Block List [DONE]  
Block blobs only.
Retrieves the list of blocks that have been uploaded as part of a block blob.

- Put Page [DONE]  
Page blobs only.
Writes a range of pages into a page blob.

- Get Page Ranges [DONE]  
Page blobs only.
Returns a list of valid page ranges for a page blob or a snapshot of a page blob.

- Append Block [DONE]  
Append blobs only
