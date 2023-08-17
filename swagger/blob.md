# Azurite Server Blob

> see https://aka.ms/autorest

```yaml
package-name: azurite-server-blob
title: AzuriteServerBlob
description: Azurite Server for Blob
enable-xml: true
generate-metadata: false
license-header: MICROSOFT_MIT_NO_VERSION
output-folder: ../src/blob/generated
input-file: blob-storage-2021-10-04.json
model-date-time-as-string: true
optional-response-headers: true
enum-types: true
```

## Changes Made to Client Swagger

1. Get container properties can both use get/head, however client swagger only supports get; We can fork a server swagger, rebase to client swagger periodic.

2. Updated blocklisttype for list blob blocks from required to optional.

3. Make "Deleted" and "Snapshot" from required to optional for "BlobItemInternal" model from:

4. Change "Name" definition in "BlobItemInternal" from:
   "Name": {
      "$ref": "#/definitions/BlobName"
   }
   to
   "Name": {
   "type": "string"
   }

5. Add "","deleted" to "ListContainersInclude" enum, add "","tags","versions","deletedwithversions","legalhold","permissions" to "ListBlobsInclude" enum.

6. Add section for "Container_SubmitBatch" operation.

7. Change "Name" definition in "BlobPrefix" from:
   "Name": {
   "$ref": "#/definitions/BlobName"
   }
   to
   "Name": {
   "type": "string"
   }

9. Make `ApiVersionParameter` parameter from required to optional.

10. Add `x-ms-creation-time` to Blob_Download API response.

11. Add "Premium" to "AccessTierRequired" enum and "AccessTierOptional" enum.
    Add "Mutable" to "ImmutabilityPolicyMode" at around line #11994

12. Add spec for: Blob_GetAccountInfoWithHead, Container_GetAccountInfoWithHead and Service_GetAccountInfoWithHead.

13. Change return code from '200' to '202' for service_submitbatch.

14. Change "AllowedHeaders" and "ExposedHeaders" to from required to optional.

15. Remove "Container_Rename" section.

16. Add "x-ms-delete-type-permanent" to "Blob_Delete" API response.
