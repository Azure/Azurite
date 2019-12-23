# Changelog

> Note. This file includes changes after 3.0.0-preview. For legacy Azurite changes, please goto GitHub [releases](https://github.com/Azure/Azurite/releases).

# Upcoming Release

- Fixed a bug that to return the list of containers in sorted order.
- Fixed a bug that get/download blob snapshot fail.
- Check input request "x-ms-version" Header, only valid version are allowed.
- Fixed a race condition that GC will delete active write extents.
- Force flush data into disk before data upload request returns.

Blob:

- [Breaking] Apply LokiFsStructuredAdapter as default blob metadata loki adapter to improve performance.
  - This version cannot guarantee compatible with persisted database models file by previous version. Remove previous metadata file and restart Azurite in case any errors.
- [Breaking] Azurite updates underline metadata schema which does not compatible with previous versions. Please clean up Azurite previous version workspace data files and restart Azurite.
- In getBlockList, filter the returned block list with input BlockListingFilter.
- Added support for CORS.
- AllowedHeaders and ExposedHeaders are optional now when setting CORS.
- Added support to create block blob with empty block list.
- Stage block cannot have blockID longer than 64.
- Fix the issue that Copy Blob will overwrite the destination blob Lease status.
- Fix the issue that Change Lease fail when blob lease id only matches the input ProposedLeaseId.
- Fix the issue that UploadPage, ClearPage will fail on leased Page blob, even input correct lease id.
- Change some lease error code to align with server.
- Fixed a bug that set blob tier doesn't work with account SAS.
- Fixed a bug that Azurite Blob service cannot start in Mac as Visual Studio Extension.
- Fixed a bug that persistency location cannot be customized through -l parameter.
- Fixed a bug that GC will remove uncommitted blocks.
- Fixed a bug that download page blob doesn't return content range header.
- Fixed a bug that uncommitted block blob invalid length.

Queue:

- AllowedHeaders and ExposedHeaders are optional now when setting CORS.
- Fix Put message fail with max messagettl.

# 2019.11 Version 3.3.0-preview

- Azurite now supports customized account names and keys by environment variable `AZURITE_ACCOUNTS`.
- Improved logging for underlayer operations, such as persistency data read and write operations.
- Handled race condition of GC when sometimes newly created extents will be removed.
- Fixed a bug when uploading blob will fail when md5 header is empty string.
- Fixed a bug when sometimes list containers or blobs doesn't have proper lease status.
- [Breaking] This version cannot guarantee compatible with persisted database models in Azurite workspace used by previous version. Clean Azurite workspace folder and restart Azurite in case any errors. Notice that, data will be lost after cleaning Azurite workspace folder.

Blob:

- Fixed a bug that snapshot blob doesn't honor metadata options.
- Force alphabetical order for list blob results.
- Updated Azure Storage API version to 2019-02-02, and added following new features:
  - Supports new SAS format with blob snapshot.
  - Responses now includes x-ms-client-request-id when client request ID provided in request.
  - Copy Blob and Set Blob Tier APIs support the x-ms-rehydrate-priority.
- Improved container & blob lease implementation.
- Provided SQL based blob metadata store implementation.
- Added GC support for blob SQL metadata store.

Queue:

- Responses now includes x-ms-client-request-id when request provided client request ID.

# 2019.08 Version 3.2.0-preview

- Updated repository link to https to compatible with Visual Studio Code.

Blob:

- Fix listblobs order when filtering by prefix.

Queue:

- Added Azure Storage Queue Service features (API version: 2019-02-02).
- Decoupled persistence layer into service metadata storage and extent file storage.
- Supported Cors and Preflight in Queue service.

# 2019.06 Version 3.1.2-preview

- Integrated Azurite with Visual Studio Code as an extension.
- Added Visual Studio Code extension usage guidelines.
- Added Dockerfile and usage descriptions.
- Fixed an authentication issue when copy blob to override an existing blob with SAS.
- Return 404 for copy blob operation when source blob doesn't exist.
- Fixed an issue that metadata doesn't get copied when copy blob.
- Fixed GetBlockBlob missing Content-Range header

# 2019.05 Version 3.0.0-preview

- Initial Release of Azurite V3.
