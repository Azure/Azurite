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
input-file: blob-storage-2019-02-02.json
model-date-time-as-string: true
optional-response-headers: true
enum-types: true
```

## Changes Made to Client Swagger

1. Get container properties can both use get/head, however client swagger only supports get; We can fork a server swagger, rebase to client swagger periodic.

2. Updated blocklisttype for list blob blocks from required to optional.

3. Make "Deleted" from required to optional for BlobItem model.

4. Make `ApiVersionParameter` parameter from required to optional.