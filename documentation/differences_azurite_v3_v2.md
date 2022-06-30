## Differences between Azurite V3 and Azurite V2

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

Azurite V3 selected TypeScript as its' programming language, as this facilitates broad collaboration, whilst also ensuring quality.

### Features Scope

Legacy Azurite V2 supports Azure Storage Blob, Queue and Table services.
Azurite V3 currently only supports Azure Storage blob service. Queue service is supported after V3.2.0-preview.
Table service support is currently under discussion.

Azurite V3 supports features from Azure Storage API version 2021-08-06, and will maintain parity with the latest API versions, in a more frequent update frequency than legacy Azurite V2.
