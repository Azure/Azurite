# Changelog

> Note. This file includes changes after 3.0.0-preview. For legacy Azurite changes, please goto GitHub [releases](https://github.com/Azure/Azurite/releases).

## Upcoming Release

## 2025.07 Version 3.35.0

General:

- Bump up service API version to 2025-11-05
- Added support for service API version to 2025-07-05

Blob:

- Fixed issue of filtering blobs with correct multiple conditions on single tag (range queries). (issue #2514)
- Added support for sealing append blobs. (issue #810)
- Added support for delegation sas with version of 2025-07-05.
- Fix issue on SQL: Delete a container with blob, then create container/blob with same name, and delete container will fail. (issue #2563)

Table:

- Added support to query entity with simple filters as empty string, 'true' or 'false'. (issue #2450, #1573)

## 2025.02 Version 3.34.0

General:

- Bump up service API version to 2025-05-05
- Changed the responds status code of not implemented API from 500 to 501.
- Added telemetry data collection to help improve the product. By default telemetry data will be collected. Add `--disableTelemetry` options disable telemetry data collection of this Azurite execution.
- Updated Node and Alpine versions to account for EOL and CVE concerns.

Blob:

- GetBlob on Archive tier blobs now fails as expected.
- Fixed issue of download 0 size blob with range > 0 should have header "Content-Range: bytes \*/0" in returned error. (issue #2458)
- Aligned behavior with Azure to ignore invalid range requests for blob downloads. (issue #2458)
- Consider both Content-MD5 and x-ms-blob-content-md5 when creating a blob.

Table:

- Fixed "Unexpected EOF" error when batch InsertReplace entities with Go SDK (issue #2519)

## 2024.10 Version 3.33.0

General:

- Bump up service API version to 2025-01-05

Blob:

- Added support for filtering blob by tags.
- Fixed an issue where all blob APIs allowed metadata names which were not valid C# identifiers.
- Fixed always including metadata on blob list even when not requested

## 2024.08 Version 3.32.0

General:

- Bump mysql2 to resolve to 3.10.1 for security patches
- Fixed an issue where premature client disconnections led to all following requests failing with a 500 error. (issue #1346)
- Bump up service API version to 2024-11-04

Blob:

- Fixed issue of download 0 size blob with range > 0 should report error. (issue #2410)
- Fixed issue of download a blob range without header x-ms-range-get-content-md5, should not return content-md5. (issue #2409)
- Fixed issue of list container without include=metadata should not clear container metadata on server. (issue #2416)
- Supported x-ms-copy-source-tag-option in copy blob from Uri. (issue #2398)
- Added blobKeepAliveTimeout option (issue #2053)

Table:

- Added tableKeepAliveTimeout option (issue #2053)

Queue:

- Added queueKeepAliveTimeout option (issue #2053)

## 2024.06 Version 3.31.0

General:

- Bump up service API version to 2024-08-04

Blob:

- Fix issue of not refreshing lease state within block blob/append blob upload operation. (issue #2352)

## 2024.04 Version 3.30.0

General:

- Bump up service API version to 2024-05-04
- Fixed issue of failure when connecting to mssql with docker image or exe.

Blob:

- Fixed issue of setting blob tag should not update Blob Etag and LastModified. (issue #2327)
- Fix HTTP header parsing of `SubmitBatch()`. If a HTTP header has HTTP header delimiter (`:`) in its value, `SubmitBatch()` returns "400 One of the request inputs is not valid". For example, if `user-agent` header is `azsdk-cpp-storage-blobs/12.10.0-beta.1 (Darwin 23.1.0 arm64 Darwin Kernel Version 23.1.0: Mon Oct  9 21:28:12 PDT 2023; root:xnu-10002.41.9~6/RELEASE_ARM64_T8103)`, all `SubmitBatch()` requests are failed.
- Fixed issue of blob copying succeed without 'r' permission in source blob's SAS token credential.
- Fixed issue of list container contains metadata even request doesn't have include=metadata (issue #2382)

Table:

- Fail the insert entity request with double property whose value is greater than MAX_VALUE (Issue #2387)

Table:

- Fixed issue of returning incorrect entities when querying table with int64 values. (issue #2385)

## 2023.12 Version 3.29.0

General:

- Bump up service API version to 2024-02-04

Table:

- Filters etag from entity writes - seen when some tools clone tables (issue #1536)

## 2023.11 Version 3.28.0

General:

- Add `--inMemoryPersistence` and `--extentMemoryLimit` options and related configs to store all data in-memory without disk persistence. (issue #2227)

Blob:

- Fixed issue of not requiring SAS permission for some specific operations. (issue #2299)

Table:

- Fixed table sas request failure with table name include upper case letter (Issue #1359)
- Filters etag from entity writes - seen when some tools clone tables (issue #1536)

## 2023.10 Version 3.27.0

General:

- Bump up service API version to 2023-11-03

Blob:

- Fix validation of Blob SAS token when using the second key for an account in `AZURITE_ACCOUNTS`
- Set accessTierInferred to false after upload blob with accessTier (issue #2038)
- Support blob new access tier Cold
- Fixed startCopyFromURL, copyFromURL API to return 400 (InvalidHeaderValue) when copy source has invalid format. (issue #1954)
- Fixed CommitBlockList API to return 400 (InvalidXmlDocument) when the request is sent with JSON body. (issue #1955)
- Added "x-ms-is-hns-enabled" header in GetAccountInfo API responds (issue #1810)
- Fixed authentication error in production style URL for secondary location (issue #2208)
- Fixed issue of failures for blob batch requests in product style.

Queue:

- Fixed set Queue ACL failure when Start is missing (issue #2065)
- Fixed authentication error in production style URL for secondary location (issue #2208)

Table:

- Fixed the errorCode returned, when malformed Etag is provided for table Update/Delete calls. (issue #2013)
- Fixed an issue when comparing `'' eq guid'00000000-0000-0000-0000-000000000000'` which would erroneously report these as equal. (issue #2169)
- Fixed authentication error in production style URL for secondary location (issue #2208)

## 2023.08 Version 3.26.0

General:

- Updated examples of setting Customized Storage Accounts & Keys in enviroment variable.
- Bump up service API version to 2023-08-03

Blob:

- Added "x-ms-delete-type-permanent" header in delete blob API responds (issue #2061)

Queue:

- Fixed error code when dequeue message with invalid visibilitytimeout (issue #2083)
- Fixed error code when sas request authentication failed (issue #2064)

## 2023.08 Version 3.25.1

Blob:

- Fixed issue of: Append block not returning requestId in response.

Table:

- Fixed issue with queries on empty string partition keys failing
- Fixed an issue when querying datetimes with microsecond precision which resulted in match failures. (issue #2069)

## 2023.07 Version 3.25.0

Table:

- Refactor table query code
- Fixed issue with query table fail with filter condition as string.Empty. (issue #1880)
- Fixed merge table entity fail with single quota in PK/RK. (issue #2009)

## 2023.06 Version 3.24.0

General:

- Bump up service API version to 2023-01-03

Blob:

- Fixed issue of: blob batch subresponse is slightly different from the on from Azure service, which causes exception in CPP SDK.
- Fixed issue of: setMetadata API allows invalid metadata name with hyphen.
- Supported rest API GetBlobTag, SetBlobTag.
- Supported set Blob Tags in upload blob, copy blob.
- Supported get Blob Tags (count) in download blob, get blob properties, list blobs.
- Added support for large append blob with bumping block size limitation to 100MB.

Table:

- Fixed issue with headers length when deserializing batch deletes.
- Fixed issues with the use of backticks in string query predicates.
- Replaced the query filter implementation with a custom interpreter which mitigates the risk of JS-query injection.

## 2023.03 Version 3.23.0

General:

- Return 404 StatusCode when Storage account not exist
- Migrated tslint to eslint.
- TypeScript upgraded from 4.2.4 to 4.9.5.
- Migrated test pipeline from Node.js 10/12 to Node.js 14/16/18.
- Bump up service API version to 2022-11-02

Blob:

- Fixed issue for user delegation key when uploading a blob from a container SAS
- Upgraded swagger spec to API version 2021-10-04.

Table:

- Fixed issue for querying on identifiers starting with underscore.
- Corrected query parsing logic for single boolean terms.
- Fixed issue for querying GUIDs using operators other than eq and ne
- GUID queries only support persistent storage on legacy (string) format GUIDs for eq and ne operators, other operators will only evaluate newly stored entities.
- Fixed issue with boolean values not being recognized in query if using different cased characters.

Queue:

- Fixed issue that queue service SAS without start time not work.

## 2023.02 Version 3.22.0

General:

- Bump up service API version to 2021-12-02

Table:

- Fixed issue that True/False in table query will fail the request.
- Fixed an issue: it cannot return result correctly when querying for a table entity with filters including some special characters.
- Fixed issue with decoding URIs from batch request submitted by old Azure Storage SDK.

## 2023.01 Version 3.21.0

General:

- Fixed shared key authentication failure when request uri contains "+"
- Stop accepting new connections and closes existing, idle connections (including keep-alives) without killing requests that are in-flight.

Blob:

- Support Copy Blob From URL API when use different source and destination account (in same Azurite instance).
- Support use of wildcard character to allow all subdomains of a given domain to make requests via CORS
- Add support for user delegation key.

Table:

- Added exit parameter to tests so they don't hang.
- Fixed request not fail on creating an entity without specifying a property value of type DateTimeOffset
- Fixes issues using and querying GUID types.
- Removes odata Timestamp type from entities when accept is set to minimalmetadata.
- Ensures no entities are returned when queries use $top=0.
- Fixes issues querying for binary values.
- Implements new query parsing logic.

## 2022.10 Version 3.20.1

General:

- Bump package version.

## 2022.10 Version 3.20.0

General:

- Make emulator start commands async so that they can be awaited by clients.

Blob:

- Add support for blob batch operation.

Table:

- TimeStamp and Etag use the same high precision value as source.

## 2022.09 Version 3.19.0

General:

- Bump up service API version to 2021-10-04
- Added support for docker image on arm64 architecture.
- Updated Readme by adding account key must be base64 encoded string.

Table:

- Correctly responds with status 202 on merge with nonexistent entity.
- Properly differentiate between upsert and update in batch merge and replace.
- Added additional tests via raw REST tests.
- Correctly deletes a table that is a substring of another table.
- Adds Sample Go App to check that Batch responses work for Go SDK.
- Removes extra CRLFs from all serialized Batch responses, adds missing CRLF after Etag header.

## 2022.06 Version 3.18.0

General:

- Bump up service API version to 2021-08-06
- Modified the error message for invalid API version to make it more actionable.

Blob:

- Fixed issue that startCopyFromURL and copyFromURL API not fail, when request container if-none-match="\*" and dest blob already exist.

Table:

- Reject table batch request bodies exceeding 4MB.
- Fix binary table property validation to be 64K bytes not 32K characters.
- Does not error when table created is a substring of another table.
- Correctly responds with status 404 on patch with non-existant entity.
- Fix pagination when no rowkey in continuation token

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
- Fixed batch response for Go SDK, includes additional CRLF on closure of changesetresponse section.
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

- Fixed issue that startCopyFromURL and copyFromURL API not respect `--disableProductStyleUrl` parameter in parse source URI.

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
- Fixed access to secondary location with IP style URI from JS/.net SDK failure.
- Fixed an issue in Visual Studio Code extension, by changing the Location with relative path, from base on Visual Studio Code installation path, to base on the current opened workspace folder.

Blob:

- Fixed start copy blob fail with `x-ms-access-tier` header and from Archive blob in same account.

## 2021.10 Version 3.14.3

General:

- Added new parameter `--disableProductStyleUrl`, to force parsing storage account from request URI path, instead of from request URI host.
- Restored ability to connect to host.docker.internal.

Blob:

- Fixed list blob API "include" query parameter not work when not lower case, by make it case-insensitive.
- Supported list container/blob with "include" query parameter as empty string.
- Added more allowed value to list blob request "include" query parameter:'tags', 'versions', 'deletedwithversions', 'immutabilitypolicy', 'legalhold', 'permissions'.
- Added more allowed value to list container request "include" query parameter: 'deleted'.
- Raised 416 when start range is bigger than blob length.
- Fixed issue that duplicated decode rscd, rsce, rscl and rsct of SAS token in input request URI.

Queue:

- Fixed issue that expired message still can be get, peek, update, delete.

Table:

- Supported basic level of OAuth authentication on Table service.
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

- Fixed list containers, get service properties or account properties API failure, when request URI has a suffix '/' after account name.
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
- Fix delete nonexistent table error code and error message, to be aligned with Azure server.
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
- Fix SqlBlobMetadataStore.getBlockList, to make it fail for nonexistent blobs.

## 2020.07 Version 3.8.0

- Bump up Azure Storage service API version to 2019-12-12.
- Support skip request API version check by Azurite configuration parameter `--skipApiVersionCheck`.
- Fixed an issue that list blobs doesn't honor uncommitted include option.
- Updated docker base image to lts-alpine.
- Removed testing certs from docker image.

## 2020.04 Version 3.7.0

- Supported HTTPS endpoint. Specific parameter `azurite --cert server.cert --key server.key` to enable HTTPS mode.
- Supported basic level of OAuth authentication. Specific parameter `azurite --oauth basic` to enable OAuth authentication.

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
