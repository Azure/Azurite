# Azurite Server DFS (ADLS Gen2)

> see https://aka.ms/autorest

```yaml
package-name: azurite-server-dfs
title: AzuriteServerDfs
description: Azurite Server for DFS (ADLS Gen2)
enable-xml: false
generate-metadata: false
license-header: MICROSOFT_MIT_NO_VERSION
output-folder: ../src/blob/generated-dfs
input-file: dfs-storage-2023-11-03.json
model-date-time-as-string: true
optional-response-headers: true
enum-types: true
```

## Notes

The DFS API uses JSON (not XML like Blob), so `enable-xml` is false.

The AutoRest code generator used by Azurite (`autorest.typescript.server`) is a
custom fork not publicly available. To regenerate, run:

```
autorest ./swagger/dfs.md --typescript --use=<path-to-autorest.typescript.server>
```

## Changes Made to Standard DFS Swagger

1. Made `x-ms-version` header optional to match emulator behavior.
2. Added `x-ms-rename-source` header to Path_Create for rename operations.
3. Made `resource` query parameter optional on Path operations (required only for create).
4. Added lease action operations as distinct operations rather than header-dispatched variants.
