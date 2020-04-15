# Changelog

> Note. This file includes changes after 3.0.0-preview. For legacy Azurite changes, please goto GitHub [releases](https://github.com/Azure/Azurite/releases).

## 2020.04 Version 3.7.0

- Supported HTTPS endpoint. Specific parameter `azurite --cert server.cert --key server.key` to enable HTTPS mode.
- Supported basic level of OAuth autentication. Specific parameter `azurite --oauth basic` to enable OAuth autentication.

Blob:

- Supported append blob.
- Fixed a bug that stageBlock retry will remove existing block in Loki based implementation.

## 2020.03 Version 3.6.0

- Supported conditional headers.
- Compatible with upper case or lower case of x-ms-sequence-number-action values.
- Fixed issue that x-ms-blob-sequence-number of 0 should be returned for HEAD requests on Page blob.
- Uploading blocks with different lengths of IDs to the same blob will fail.
- Check if block blob exists should fail if blocks are all uncommitted.
- Case sensitive with metadata keys.

## 2020.02 Version 3.5.0

- Bump up Azure Storage service API version to 2019-07-07.
- Added description to clean up Azurite.
- Response for HEAD request will not return body and content-type.

Blob:

- Change the etag format to align with Azure Server behavior.
- Added missing last-modified header for get blob metadata request.

## 2019.12 Version 3.4.0

- Return the list of containers will be in sorted order.
- Fixed a bug that get/download blob snapshot fails.
- Check input request "x-ms-version" Header, only valid version are allowed.
- Fixed a race condition that GC will delete active write extents.
- Force flush data into disk before data upload request returns.
- [Breaking] By default Azurite will block requests with unsupported headers or parameters which may impact data integrity.
  - Skip this by switching to loose mode by Azurite configuration parameter `--loose`.

Blob:

- [Breaking] Azurite updates underline metadata schema which does not compatible with previous versions.
  - This version cannot guarantee compatible with persisted database models file by previous version. Remove previous metadata file and restart Azurite in case any errors.
- List blocks will filter the returned block list with input BlockListingFilter.
- Added support for CORS.
- AllowedHeaders and ExposedHeaders are optional now when setting CORS.
- Added support to create block blob with empty block list.
- Stage block cannot have blockID longer than 64.
- Fix the issue that Copy Blob will overwrite the destination blob Lease status.
- Fix the issue that Change Lease fail when blob lease id only matches the input ProposedLeaseId.
- Fix the issue that UploadPage, ClearPage will fail on leased Page blob, even input correct lease id.
- Update some lease error codes to align with Azure Storage.
- Fixed a bug that set blob tier doesn't work with account SAS.
- Fixed a bug that Azurite Blob service cannot start in Mac as Visual Studio Extension.
- Fixed a bug that persistency location cannot be customized through -l parameter.
- Fixed a bug that GC will remove uncommitted blocks.
- Fixed a bug that download page blob doesn't return content range header.
- Fixed a bug that uncommitted block blob invalid length.
- Fixed a bug that SetHTTPHeaders, SetMetadata won't update blob etag.
- Remove double quotation marks from list blob request returned blob etag, to align with Azure Server behavior.
- Fixed a bug that BlobTierInferred not change to false after SetBlobTier.
- Blocked set tier for page blob which requires premium storage account where Azurite provides standard storage account.
- GetPageRangesDiff API (incremental snapshot) now returns NotImplementedError.
- Fixed a bug that listing containers won't honor prefix with marker when using external metadata database.

Queue:

- AllowedHeaders and ExposedHeaders are optional now when setting CORS.
- Fix Put message fail with max messagettl.
- Updated message size calculation when checking 64KB limitation.

## 2019.11 Version 3.3.0-preview

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

## 2019.08 Version 3.2.0-preview

- Updated repository link to https to compatible with Visual Studio Code.

Blob:

- Fix listblobs order when filtering by prefix.

Queue:

- Added Azure Storage Queue Service features (API version: 2019-02-02).
- Decoupled persistence layer into service metadata storage and extent file storage.
- Supported Cors and Preflight in Queue service.

## 2019.06 Version 3.1.2-preview

- Integrated Azurite with Visual Studio Code as an extension.
- Added Visual Studio Code extension usage guidelines.
- Added Dockerfile and usage descriptions.
- Fixed an authentication issue when copy blob to override an existing blob with SAS.
- Return 404 for copy blob operation when source blob doesn't exist.
- Fixed an issue that metadata doesn't get copied when copy blob.
- Fixed GetBlockBlob missing Content-Range header

## 2019.05 Version 3.0.0-preview

- Initial Release of Azurite V3.
