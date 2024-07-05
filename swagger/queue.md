# Azurite Server Queue

> see https://aka.ms/autorest

```yaml
package-name: azurite-server-queue
title: AzuriteServerQueue
description: Azurite Server for Queue
enable-xml: true
generate-metadata: false
license-header: MICROSOFT_MIT_NO_VERSION
output-folder: ../src/queue/generated
input-file: ./queue-storage.json
model-date-time-as-string: true
optional-response-headers: true
enum-types: true
```

## Changes Made to Client Swagger

1. Remove minimum/maximum limitation for "VisibilityTimeout" and "VisibilityTimeoutRequired".

2. Remove "required" section from definition "AccessPolicy" to align with server behavior.
