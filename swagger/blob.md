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

3. Only for 2019-02-02, make "Deleted" and "Snapshot" from required to optional for BlobItem model.

4. Only for 2021-10-04, make "Deleted" and "Snapshot" from required to optional for "BlobItemInternal" model from:

5. Change for 2021-10-04, change "Name" definition in "BlobItemInternal" from:
   "Name": {
   "$ref": "#/definitions/BlobName"
   }
   to
   "Name": {
   "type": "string"
   }

6. Add "","deleted" to "ListContainersInclude" enum, add "","tags","versions","deletedwithversions","legalhold","permissions" to "ListBlobsInclude" enum.

7. Add section for "Container_SubmitBatch" operation.

8. Only for 2021-10-04, change "Name" definition in "BlobPrefix" from:
   "Name": {
   "$ref": "#/definitions/BlobName"
   }
   to
   "Name": {
   "type": "string"
   }

9. Make `ApiVersionParameter` parameter from required to optional.

10. Add `x-ms-creation-time` to Blob_Download API responds

11. Only for 2019-02-02, add "", "deleted" to "ListContainersInclude" enum, add "", "tags", "versions", "deletedwithversions", "legalhold", "permissions" to "ListBlobsInclude" enum.

12. Only for 2021-10-04, add "" to "ListContainersInclude" enum, add "", "permissions" to "ListBlobsInclude" enum.

13. Only for 2021-10-04, add "Premium" to "AccessTierRequired" enum and "AccessTierOptional" enum.
    Add "Mutable" to "ImmutabilityPolicyMode" at around line #11994

14. Only for 2021-10-04, add spec for: Blob_GetAccountInfoWithHead, Container_GetAccountInfoWithHead and Service_GetAccountInfoWithHead.

15. Only for 2021-10-04, change return code from '200' to '202' for service_submitbatch.

16. Only for 2021-10-04, change "AllowedHeaders" and "ExposedHeaders" to be not required.
