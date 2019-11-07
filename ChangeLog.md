# Changelog

> Note. This file includes changes after 3.0.0-preview. For legacy Azurite changes, please goto GitHub [releases](https://github.com/Azure/Azurite/releases).

2019.11 Version 3.3.0-preview

- Azurite now supports customized account name and keys by environment variable `AZURITE_ACCOUNTS`.
- Added logging for underlayer operations, such as persistency data read and write operations.
- [Breaking] This version cannot guarantee compatible with persisted database models file by previous version.

Blob:
- Fixed a bug that snapshot blob doesn't honor metadata options.
- Updated Azure Storage API version to 2019-02-02, and added following new features:
  - Supports new SAS format with blob snapshot.
  - Responses now includes x-ms-client-request-id when client request ID provided in request.
  - Copy Blob and Set Blob Tier APIs support the x-ms-rehydrate-priority.
- Improved container & blob lease implementation.
- Provided SQL based blob metadata store implementation.
- Added GC support for blob SQL metadata store.

Queue:
- Responses now includes x-ms-client-request-id when request provided client request ID.

2019.08 Version 3.2.0-preview 

- Updated repository link to https to compatible with Visual Studio Code.

Blob:
- Fix listblobs order when filtering by prefix.

Queue:
- Added Azure Storage Queue Service features (API version: 2019-02-02).
- Decoupled persistence layer into service metadata storage and extent file storage.
- Supported Cors and Preflight in Queue service.

2019.06 Version 3.1.2-preview

- Integrated Azurite with Visual Studio Code as an extension.
- Added Visual Studio Code extension usage guidelines.
- Added Dockerfile and usage descriptions.
- Fixed an authentication issue when copy blob to override an existing blob with SAS.
- Return 404 for copy blob operation when source blob doesn't exist.
- Fixed an issue that metadata doesn't get copied when copy blob.
- Fixed GetBlockBlob missing Content-Range header

2019.05 Version 3.0.0-preview

- Initial Release of Azurite V3.
