# Azurite
[![npm version](https://badge.fury.io/js/azurite.svg)](https://badge.fury.io/js/azurite)
[![license](https://img.shields.io/github/license/mashape/apistatus.svg?maxAge=2592000)]()
[![Build Status](https://travis-ci.org/arafato/azurite.svg?branch=master)](https://travis-ci.org/arafato/azurite)

A lightweight server clone of Azure Blob Storage that simulates most of the commands supported by it with minimal dependencies.

# Installation
$ npm install -g Azurite

$ azurite -l path/to/localfolder

# Endpoints
Standard Emulator Connection String:

BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;

You do not need to provide an account key.

# REST APIs
https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/blob-service-rest-api

# Error Codes
https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/blob-service-error-codes

# API Status Implementation
## List Containers [DONE]
Lists all of the containers in a storage account.
Markers are not supported yet.

## Set Blob Service Properties 	
Sets the properties of the Blob service, including logging and metrics settings, and the default service version.

## Get Blob Service Properties
Gets the properties of the Blob service, including logging and metrics settings, and the default service version.

## Preflight Blob Request
Queries the Cross-Origin Resource Sharing (CORS) rules for the Blob service prior to sending the actual request.

## Get Blob Service Stats
Retrieves statistics related to replication for the Blob service. This operation is only available on the secondary location endpoint when read-access geo-redundant replication is enabled for the storage account.

## Create Container [DONE] 
Creates a new container in a storage account.

## Get Container Properties [DONE] 	
Returns all user-defined metadata and system properties of a container.

## Get Container Metadata [DONE]	
Returns only user-defined metadata of a container.

## Set Container Metadata [DONE]
Sets user-defined metadata of a container.

## Get Container ACL 	 	
Gets the public access policy and any stored access policies for the container.

## Set Container ACL 
Sets the public access policy and any stored access policies for the container.

## Lease Container 	
Establishes and manages a lock on a container for delete operations.

## Delete Container [DONE] 	
Deletes the container and any blobs that it contains.

## List Blobs [DONE]
Lists all of the blobs in a container.

## Put Blob [DONE]
Creates a new blob or replaces an existing blob within a container.

## Get Blob [DONE]	
Block Blobs only.
 	
Reads or downloads a blob from the Blob service, including its user-defined metadata and system properties.

## Get Blob Properties [DONE] 	 	
Returns all system properties and user-defined metadata on the blob.

## Set Blob Properties [DONE] 	 	
Sets system properties defined for an existing blob.

## Get Blob Metadata [DONE]
Retrieves all user-defined metadata of an existing blob or snapshot.

## Set Blob Metadata [DONE]
Sets user-defined metadata of an existing blob.

## Delete Blob [DONE]
Marks a blob for deletion.

## Lease Blob
Establishes and manages a lock on write and delete operations. To delete or write to a locked blob, a client must provide the lease ID.

## Snapshot Blob
Creates a read-only snapshot of a blob.

## Copy Blob
Copies a source blob to a destination blob in this storage account or in another storage account.

## Abort Copy Blob
Aborts a pending Copy Blob operation, and leaves a destination blob with zero length and full metadata.

## Put Block [DONE]
Block blobs only 	
Creates a new block to be committed as part of a block blob.

## Put Block List [DONE]
Block blobs only
Commits a blob by specifying the set of block IDs that comprise the block blob.

## Get Block List [DONE]
Block blobs only
Retrieves the list of blocks that have been uploaded as part of a block blob.

## Put Page
Page blobs only
Writes a range of pages into a page blob.

## Get Page Ranges
Page blobs only
Returns a list of valid page ranges for a page blob or a snapshot of a page blob.

## Append Block [DONE]
Append blobs only