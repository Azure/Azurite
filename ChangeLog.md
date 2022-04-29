# Changelog

> Note. This file includes changes after 3.0.0-preview. For legacy Azurite changes, please goto GitHub [releases](https://github.com/Azure/Azurite/releases).

## Upcoming Release

## 2022.04 Version 3.17.1

Table:

- Removes commas from RegEx checking key validity.
- Updated property check to handle null property and added regression test.

## 2022.04 Version 3.17.0

General:

- Bump up service API version to 2021-06-08
- Fixed SAS validation failure for version 2020-12-06 and later

Table:

- Fixed empty partition key and row key handling in batch write operations.
- Fixed batch reponse for Go SDK, includes additional CRLF on closure of changesetresponse section.
- Removed query strings from Location and DataServiceId batch response headers.
- Modified the deserialization of batch request for case that a raw / not url encoded % is present in the body.
- Added additional tests and checks for table names on creation.
- Added more granularity and precision to etags.
- Added checks for invalid characters in partition and row keys.
- Rejects entities with string props longer than 32K chars.
- Added check for body length greater than 4MB.

## 2022.02 Version 3.16.0

General:

- Bump up service API version to 2021-04-10
- Ensure the storage location exists, and allow relative paths in the VSCode extension settings that are resolved based on the workspace folder.
- Update Azure CI to use latest image of windows due to deprecation of `vs2017-win2016` image

Blob:

- Fixed issue that startCopyFromURL and copyFromURL API not respect `--disableProductStyleUrl` parameter in parse source Uri.

Queue:

- Fixed issue that queue list result is not in alphabetical order.
- Fixed class name of QueueSASAuthenticator mistakenly named BlobSASAuthenticator.

Table:

- Fixed issues with deleting entities using empty string for RowKey.
- Fixed HTTP 500 causes by continuation token containing non-ASCII. Values are now encoded with base64.
- Fixed a table sas test case failure.
- Added support for batch transaction rollback on error in batch.
- Fixes issues with Whitespacing in Table Queries
- Fixes issue with Edm Type Validation
- Fixes issue when trying to add entity with Boolean or Int32
- Failed table transaction correctly returns 409 Status code
- Refactors tests for Table APIs
- Adds several tests for Table APIs
- Fixes issues for upsert and merge with etag matching
- Allow any valid weak etag even though we know it will fail with a 412
- Added check for table query validity

## 2021.12 Version 3.15.0

General:

- Bump up service API version to 2021-02-12
- Fixed access to secondary location with IP style Uri from JS/.net SDK failure.
- Fixed an issue in Visual Studio Code extension, by changing the Location with relative path, from base on Visual Studio Code installation path, to base on the current opened workspace folder.

Blob:

- Fixed start copy blob fail with `x-ms-access-tier` header and from Archive blob in same account.

## 2021.10 Version 3.14.3

General:

- Added new parameter `--disableProductStyleUrl`, to force parsing storage account from request Uri path, instead of from request Uri host.
- Restored ability to connect to host.docker.internal.

Blob:

- Fixed list blob API "include" query parameter not work when not lower case, by make it case insensitive.
- Supported list container/blob with "include" query parameter as empty string.
- Added more allowed value to list blob request "include" query parameter:'tags', 'versions', 'deletedwithversions', 'immutabilitypolicy', 'legalhold', 'permissions'.
- Added more allowed value to list container request "include" query parameter: 'deleted'.
- Raised 416 when start range is bigger than blob length.
- Fixed issue that duplicated decode rscd, rsce, rscl and rsct of SAS token in input request Uri.

Queue:

- Fixed issue that expired message still can be get, peek, update, delete.

Table:

- Supported basic level of OAuth autentication on Table service.
- Removed extra CRLF from batch transaction response which caused issues for Microsoft.Azure.Cosmos.Table NuGet package.

Table:

- Fixed issue with incorrect results returned when using boolean values in query.
- Fixed issue with incorrect results returned with whitespacing and parens with int64 values in query.

## 2021.9 Version 3.14.2

Blob:

- Supported rscc, rscd, rsce, rscl, rsct query parameters in SAS tokens.
- Fixed Blob_Download API by adding header `x-ms-creation-time` in responds.

Table:

- Added getServiceProperties response.
- Added setServiceProperties response.
- Fixed paged queries across partitions.

## 2021.7 Version 3.14.1

General:

- Added support for generating standalone azurite.exe.

Table:

- Correctly returning the results of paginated queries.
- Added filter support for Query Tables operation.
- Corrected tokenization of queries in table storage.

## 2021.7 Version 3.14.0

General:

- Bump up service API version to 2020-10-02
- Added an example for run Azurite with https in docker in Readme

Blob:

- Fixed SAS-token validation for requests with Content-Encoding/Content-Language headers.
- Return `x-ms-copy-status` header from syncCopyFromURL.
- Fixed continuation token not work correctly when blob names are only number

Table:

- Added test for URI path parser and updated regex to allow for non standard dev store account names.
- Corrected serialization of errors during Entity Group Transactions.
- Corrected entity tests using invalid eTag formats.
- Added support for PATCH Verb in Table Batch Operations / Entity Group Transactions.
- Added /@Element to the odata.metadata response.
- Allowed use of empty string for partitionKey and rowKey on InsertEntity.

## 2021.6 Version 3.13.1

Blob:

- Fixed list containers, get service properties or account properties API failure, when request Uri has a suffix '/' after account name.
- Fixed get system container failure.

## 2021.6 Version 3.13.0

General:

- Bump up Azure Storage service API version to 2020-08-04.
- Updated typescript to 4.2.4.

Blob:

- Added check for invalid container name.

Table:

- Added check for invalid etag format.
- Added tests for invalid etag format.
- Corrected code to support typescript 4.2.4 update.
- Supported Table Service in Visual Studio Code extension.
- Fix an issue that query for Long Int fail in Metadata layer.
- Fix an issue of axios dependency.
- Added check for invalid table name.
- Improved handling of empty strings and strings with multiple spaces for query filters.

## 2021.4 Version 3.12.0

Table:

- Preview of Table Service in npm package and docker image. (Visual Studio Code extension doesn't support Table Service in this release)
- Allow empty RowKey in an entity.
- Fix etag format to be aligned with Azure server.
- Fix delet none exist table error code and error message, to be aligned with Azure server.
- Convert entity properties with type "Edm.DateTime" to UTC time, to be aligned with Azure server.
- Support Batch API.
- Allow complex RowKey and PartitionKey in batch API.
- Add support for replaying requests logged in debug logging.

## 2021.2 Version 3.11.0

- Bump up Azure Storage service API version to 2020-06-12.

Blob:

- Fix an issue that result of blobs enumeration cannot be parsed by Azure SDK for Go.
- Fix an issue that set tier to leased blob not work properly.
- Skip Content-Length check for Append Block if the `--loose` flag is set.
- BlockBlob_StageBlock now checks for Content-MD5 integrity, and will fail if this check does not pass.

## 2020.12 Version 3.10.0

- Bump up Azure Storage service API version to 2020-04-08.
- Add missing Azure Storage service API version 2019-10-10.

Blob:

- Fix an issue that Blob Lease properties are lost when overwrite an existing blob.
- Fix an issue that snapshot time is omitted in get block list.
- Fix an issue that no error throw when clear pages, get page ranges and upload pages with invalid page range.

## 2020.11 Version 3.11.0-table-alpha.1

- First Alpha version of Azurite V3 Table.

## 2020.10 Version 3.9.0

- Bump up Azure Storage service API version to 2020-02-10.
- Update Azurite and Azurite tests to reference Azure Storage SDK v12.
- Add handling of SIGTERM to gracefully stop the docker container.

Blob:

- Add support for async copy blobs across storage accounts within the same Azurite instance.
- Add support for async copy blobs on sql metadata store.
- Add support for blob syncCopyFromURL within same Azurite instance on loki metadata store.
- Allow mixed case characters for blob metadata prefix.
- Fix SqlBlobMetadataStore.getBlockList, to make it fail for non-existent blobs.

## 2020.07 Version 3.8.0

- Bump up Azure Storage service API version to 2019-12-12.
- Support skip request API version check by Azurite configuration parameter `--skipApiVersionCheck`.
- Fixed an issue that list blobs doesn't honor uncommitted include option.
- Updated docker base image to lts-alpine.
- Removed testing certs from docker image.

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
