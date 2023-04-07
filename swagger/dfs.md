# Azurite Server Blob

> see https://aka.ms/autorest

```yaml
package-name: azurite-server-blob
title: AzuriteServerBlob
package-version: 1.0.0
description: Azurite Server for Blob
enable-xml: true
generate-metadata: false
license-header: MICROSOFT_MIT_NO_VERSION
output-folder: ../src/dfs/generated
input-file: 
 - data-lake-storage.json-2021-04-10.json
 - blob-storage-2021-10-04-data-lake.json
model-date-time-as-string: true
optional-response-headers: true
enum-types: true
```

## Changes Made to Client Swagger

1. Added metadata to all path operations
2. changed contentMd5 to bytes in Path_Read in both responses 200, 206 and in Path_GetProperties
3. added metadata to response of getproperties
4. added LeaseAction, LeaseDuration and proposedLeaseId to Path_Flush, Path_AppendData
5. added LeaseState, LeaseStatus to blob properties
6. added IfMacth, IfNoneMatch, IfModifiedSince, IfUnmodifiedSince, Path_AppendData
7. added XmlName("paths") to pathlist
8. added "format": "date-time-rfc1123" to lastModified
9. merge Blob_GetProperties and Path_GetProperties into Path_GetProperties and remove Blob_GetProperties
10. merge Blob_Delete and Path_Delete into Path_Delete and remove Blob_Delete
11. merge Blob_Download and Path_Read into Path_Read and remove Blob_Download
12. move container listBlobsFalt to dataLake swagger and rename it to filesystem listblobsFlat
13. move container listBlobsHierarchy & file system listBlobsHierarchy and remove container listBlobsHierarchy
14. add auto-renew, acquire-release to values permitted in lease action
15. eTag renamed to etag in Path model (required for hadoop)
16. add flush option to Path_AppendData as per spec
17. added Path_SetProperties from Path_Update spec
18. added expiresOn to Path in listPaths spec

## Changes in Code:

1. isxml set to false in listPaths (required for hadoop)
2. add req.getHeader("X-HTTP-Method-Override") to dispatch.middleware.ts (required for hadoop)
