# Changelog

> Note. This file includes changes after 3.0.0-preview. For legacy Azurite changes, please goto GitHub [releases](https://github.com/Azure/Azurite/releases).

## Upcoming Release

General:

- Updated lockfile-resolved (dev-only transitive via `ajv`) `fast-uri` from 3.1.5 to 3.1.7 to remediate URI authority injection and host confusion advisories.
- Updated lockfile-resolved `mocha` from 12.0.0-rc.6 to 12.0.0 to pick up CLI argument parsing fixes (negative numbers and quoted strings).
- Updated the lockfile-resolved `@types/node` dev dependency from 26.2.0 to 26.4.0 for current Node.js API declarations, and filesystem extent coverage now validates sliced Buffer views.
- Updated lockfile-resolved `axios` from 1.19.0 to 1.20.0 for hardened runtime option handling.
- Updated lockfile-resolved `lint-staged` from 17.3.0 to 17.4.1 to pick up `picomatch` 4.0.7 and `tinyexec` 1.3.0; moved `.lintstagedrc` flat-format coverage into `tests/packageScripts.test.ts`.
- Bumped `morgan` from `^1.11.0` to `^1.12.0` (lockfile resolved to 1.12.0) to remediate CVE-2026-15603 (log forging via Unicode line separators in access log tokens).
- Updated lockfile-resolved `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` versions from 8.67.0 through 8.69.0 for bug fixes and rule updates.
- Updated the lockfile-resolved `picomatch` version from 4.0.5 to 4.0.7 to fix glob scanning and terminal globstars in parenthesized patterns.
- Updated lockfile-resolved `mysql2` from 3.23.4 to 3.24.2 to correct three-byte length-coded parameter encoding and improve SQL metadata-store performance; added SQL pool regression coverage for large bound parameters.
- Updated the lockfile-resolved `eslint` version from 10.9.0 to 10.9.1 to fix a `no-loss-of-precision` false positive for trailing decimal points.
- Updated lockfile-resolved `qs` from 6.15.3 to 6.16.0 for query-string parsing fixes.
- Updated the lockfile-resolved `globals` dev dependency from 17.11.0 to 17.12.0 for a refreshed list of environment global identifiers used by ESLint config; no code changes required.

Table:

- Fix `azurite-table` startup banner reporting the configured port (e.g. `0` when using OS-assigned ports) instead of the actual bound address. Now uses `server.getHttpServerAddress()` to match `azurite-blob` and `azurite-queue`.
    
## 2026.08 Version 3.37.0

General:

- Updated the lockfile-resolved `@typescript-eslint/parser` version from 8.66.0 to 8.67.0; added an ESLint TypeScript parsing smoke test to validate the updated parser configuration.
- Raised the minimum supported Node.js runtime from 21 to 22 because Node.js 21 has reached end of life.
- Updated Mocha to 12.0.0-rc.5 for Node.js 26 compatibility and removed the obsolete npm `always-auth` setting.
- Fixed npm 10 lockfile validation by explicitly resolving the `picomatch` peer dependency.
- Bumped `@azure/storage-blob` dev dependency from 12.28.0 to 12.33.0.
- Added an npm `overrides` entry to pin the transitive `serialize-javascript` dependency (via `mocha`) to 7.0.3, remediating GHSA-5c6j-r48x-rmvq.
- Replaced the deprecated `vsce` dev dependency with `@vscode/vsce` 3.9.2, updating the VS Code packaging toolchain to resolve `linkify-it` 5.0.2 and remediate GHSA-v245-v573-v5vm / CVE-2026-59887.
- Bumped `@typescript-eslint/parser` dev dependency from 5.62.0 to 8.65.0, and aligned `@typescript-eslint/eslint-plugin` to 8.65.0 to match. Updated `.eslintrc.js` for v8 compatibility (`no-extra-semi` and `no-unused-expressions` rules).
- Bumped `@azure/storage-queue` dev dependency from 12.27.0 to 12.31.0.
- Applied npm audit fix to updates across multiple dependencies to address security vulnerabilities and maintenance updates.
- Bumped `applicationinsights` from 2.9.6 to 3.15.1 and updated telemetry SDK type usage for compatibility.
- Bumped `express` from `^4.16.4` to `^5.2.1`, updated `@types/express` from `^4.16.0` to `^5.0.6`, and added `@types/mime` as an explicit dev dependency because it is no longer provided transitively by the Express type packages.
- Replaced `cross-var` with `cross-env-shell` to remove the vulnerable Babel 6 dependency chain while preserving cross-platform npm package version expansion.
- Bumped `@types/args` dev dependency from 5.0.3 to 5.0.4 (patch update).
- Bumped `@types/mime` dev dependency from `1.3.5` to `4.0.0`. `@types/mime` v4 is a stub package; removed `mime` from the explicit `types` list in `tsconfig.json` to avoid a missing type-definition error.
- Bumped `typescript` dev dependency from 5.9.3 to 7.0.2 for the main build, while keeping a TypeScript 6.0.3 install (pinned exactly, aliased as the `typescript` package) for `@typescript-eslint`, which only supports TypeScript `>=4.8.4 <6.1.0`. Updated `tsconfig.json` to remove compiler options removed in TypeScript 7 (`moduleResolution: "node"`, `downlevelIteration`) and to explicitly list all `@types` packages (e.g. mocha, node) under `types`, since TypeScript 7 no longer auto-includes `@types/*` packages when the option is omitted.
- Bumped `eslint` dev dependency from 8.57.1 to 10.9.0 and migrated ESLint configuration from legacy `.eslintrc.js` to the flat config format (`eslint.config.js`) required by ESLint v9+. Added `@eslint/js` and `globals` as dev dependencies to support the flat config.
- Bumped `applicationinsights` from 3.15.1 to 3.16.0 to address CVE-2026-54285.
- Bumped `@types/vscode` dev dependency from 1.103.0 to 1.134.0.
- Bumped `tedious` from 18.6.2 to 20.0.0.
- Removed the `to-readable-stream` dependency; replaced all usages with Node.js built-in `Readable.from()` for Node stream compatibility and added unit coverage for the readable body stream path.
- Bumped the default Blob, Queue, and Table service API version to `2026-06-06`.
- Added support for service API versions `2026-04-06` and `2026-02-06` for Blob, Queue, and Table endpoints.
- Bumped `multistream` from `^2.1.1` to `^4.1.0` and `@types/multistream` from `^2.1.2` to `^4.1.4`. Updated `FSExtentStore.readExtents()` and `MemoryExtentStore.readExtents()` to call `multistream` with `new` (now a class in v4) and added unit test coverage for merging multiple extents into a single stream.
- Bumped `rcedit` dev dependency from 4.0.1 to 5.0.2 (pinned exact version due to major bump) and updated `scripts/buildExe.js` to use rcedit's new named export since v5 is ESM-only and no longer exposes a default export.
- Bumped `@types/mocha` dev dependency from `^9.0.0` to `^10.0.10`, and added a Mocha context typing smoke test.
- Added support for enabling `--skipApiVersionCheck` via the `AZURITE_SKIP_API_VERSION_CHECK=true` environment variable across the `azurite`, `azurite-blob`, `azurite-queue`, and `azurite-table` command-line entrypoints. Only the exact, case-sensitive value `true` enables it.
- Bumped `@types/node` dev dependency from `^14.14.24` to `^26.1.2` (resolved 14.18.63 to 26.1.2), and fixed the resulting type errors in the extent stores and binary tests. Added unit tests covering `FSExtentStore.appendExtent()` and `MemoryExtentStore.appendExtent()` for the Buffer input path. Also fixed `MemoryExtentStore.appendExtent()` to convert stream chunks to `Buffer` so extent `count`/`offset` are measured in bytes rather than characters for multi-byte string chunks.
- Removed `husky` dev dependency entirely. It was never configured (the `"husky": {}` config was empty, no `.husky/` hooks directory existed, and `prepare` never called `husky`).
- Bumped `find-process` dev dependency from `^1.4.4` to `^2.1.1`.
- Added a version-agnostic upgrade/persistence compatibility test suite (`tests/upgrade/`, run via `npm run test:upgrade`, `test:upgrade:docker`, `test:upgrade:vsix`) that installs the latest published Azurite (npm, Docker/MCR image, and VS Code Marketplace VSIX), seeds blob (block/append/page, txt/json/csv/xml/binary), queue, and table data, upgrades in place to the local build, and verifies byte-for-byte / value-for-value integrity across all three distribution channels. The VSIX suite additionally has a standalone lifecycle test that installs/activates/starts/stops the latest published Marketplace VSIX and the locally packaged VSIX. Added dev dependency `@vscode/test-electron` for the VSIX tests, and a dedicated `.github/workflows/UpgradeCompatibility.yml` CI workflow that runs on merge to `main` and on demand.
- Replaced the `rimraf` dependency with Node.js built-in `fs.rm()`/`fs.rmSync()`: `rimrafAsync` now wraps `fs.rm` with Windows retry handling, test cleanup retries and then tolerates transient errors, and the `clean`/`clean:deep` npm scripts use a new `scripts/clean.js`. Removes the deprecated `rimraf` → `glob@7` → `inflight` dependency.
- Bumped `cross-env` dev dependency from `^7.0.3` to `^10.1.0`. Cross-env 10 is ESM-only and moved its bin scripts from `src/bin/` to `dist/bin/`. Updated `tests/packageScripts.test.ts` to resolve the `cross-env-shell` script from cross-env's declared `bin` mapping.
- Bumped `lint-staged` dev dependency from `^15.0.1` to `^17.3.0`. The `.lintstagedrc` configuration was still using the deprecated `linters`/`ignore` format removed in `lint-staged` v10+, so it was migrated to the flat glob-to-command format and a `.prettierignore` file was added (mirroring the previous `ignore` patterns for `dist`, `swagger`, `generated`, `ChangeLog.md`, and `BreakingChanges.md`) so `prettier` continues to skip those paths.
- Bumped `@vscode/test-electron` dev dependency from `^2.4.1` to `^3.1.0`.
- Updated the lockfile-resolved `@types/node` dev dependency from `26.1.2` to `26.2.0` (declared `package.json` range remains `^26.1.2`).
- Relaxed the `serialize-javascript` override from the exact `7.0.3` pin to `^7.0.7` (resolves to 7.1.0) to remediate GHSA-qj8w-gfj5-8c6v (CPU-exhaustion DoS, affects 5.0.0 - 7.0.4), bumped `mocha` dev dependency from `12.0.0-rc.5` to `12.0.0-rc.6` and deduped the transitive `serialize-javascript`/`iconv-lite` copies.
- Bumped `esbuild` dev dependency from 0.28.1 to 0.28.2.
- Bumped the `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` dev dependencies from 8.66.0 to 8.67.0 (declared `package.json` ranges remain `^8.65.0`).
- Bumped `mysql2` from 3.23.2 to 3.23.3 for SQL metadata-store connection-pool fixes; added driver and pool coverage.
- Bumped `globals` dev dependency from 17.9.0 to 17.11.0.
- Fixed clear-text logging for unknown OAuth-level handling in Blob, Queue, and Table token authenticators by removing the raw configured value from warning logs, with coverage added for the affected path.
- Bumped `@azure/identity` dev dependency lockfile resolution from 4.13.1 to 4.13.2 (declared `package.json` range remains `^4.2.1`).
- Updated the lockfile-resolved `mysql2` version from 3.23.3 to 3.23.4 (declared `package.json` range remains `^3.10.1`; fixes leading-zero truncation in TIME fractional seconds and aligns callback `Pool`/`PoolConnection` typings with runtime behavior).

Blob:

- Copy source validation now issues a HEAD request instead of downloading the entire source blob, and no longer fails the copy with 500 when the source blob declares `Content-Encoding: gzip` (related to issue #646).
- Fixed Blob Batch request parsing when multipart boundaries contain `=`, and aligned missing, empty, or duplicate boundary error handling with Azure Storage.
- Fixed issue #2672 startup failures with legacy persisted data by adding backward-compatible restore for persisted `contentMD5` formats.
- Added CRC-64/NVME transactional checksum support for `StageBlock`, `PutBlock`, `PutBlob`, `AppendBlock`, and `PutPage` (`x-ms-content-crc64`).
- Harden transactional checksum validation for `PutBlob`, `StageBlock`, `AppendBlock`, and `PutPage`: unified MD5/CRC64 validation logic with accurate `InvalidMd5`/`InvalidHeaderValue` (malformed) and `Md5Mismatch`/`Crc64Mismatch` (mismatch) errors, matching real Azure semantics verified against live.
- Implement `PutBlockFromURL` (`Put Block From URL`), which previously returned 501. The source is fetched over loopback so that SAS authentication, `x-ms-source-range`, and the `x-ms-source-if-*` conditions are enforced by the existing download path; unmet source conditions return 412 `SourceConditionNotMet`. As with `CopyBlobFromURL`, only sources on the same Azurite instance are supported.
- Fix `x-ms-blob-content-md5` precedence over `Content-MD5` for `PutBlob` transit integrity verification, matching real Azure behavior.
- Make `CopyBlobFromURL` echo back the source `Content-MD5` when supplied via `x-ms-source-content-md5`, matching real Azure behavior.
- Added support for the `startFrom` query parameter on `List Blobs` (service version `2026-02-06`), which begins a flat or hierarchical listing at the given blob name. Unlike `marker`, which is exclusive, `startFrom` is inclusive, and the two compose when paging a listing that began at `startFrom`. Previously the parameter was accepted but ignored.

Queue:

- Fixed issue #2672 startup race condition by avoiding GC-triggered `close()` calls while server status is `Starting`.

## 2026.06 Version 3.36.0

General:

- Performance improvements for internal metadata access using in-memory metadata store.
- Fix building failure on Node 22 platform.
- Fix `*` IfMatch for non-existent resource not throwing 412 Precondition Failed.
- Update Node 22 Alpine base image from 3.21 to 3.23 to address critical CVEs.
- Raise minimum supported Node.js runtime to 21+. Support for Node.js 14, 16, 18 and 20 has been removed.
- Migrate Windows/Linux binary build flow from pkg/pkg-fetch to Node.js SEA (`esbuild` + `postject`), with build-audit checks.
- Add a temporary non-blocking legacy Node 16 smoke lane in Azure Pipelines for transition monitoring.
- Address dependency vulnerabilities by upgrading packages: `@azure/ms-rest-js` to 2.x, `axios` to 1.x, `tedious` to 18.x, and `@azure/storage-blob`/`@azure/storage-queue` to 12.28.x/12.27.x.
- Enforce `undici` version `^7.28.0` via npm `overrides` to address an SFI security item.
- Remove the deprecated `azure-storage` dev dependency and migrate the affected queue and table test suites to `@azure/data-tables` and other modern Azure SDK clients (adds `@azure/identity`).
- Standardize binary data handling on `Uint8Array` instead of `Buffer` (e.g. MD5 hashes, Content-MD5, internal buffer conversions).
- Fix Windows SEA executable build producing a corrupted/bad `.exe` by stripping the Authenticode signature from the copied Node.js binary before injecting the SEA blob via `postject`.
- Replace the hardcoded user delegation signing key literal with a deterministic internal signing seed to avoid VS Code extension publish secret-scan blocks while preserving stable user delegation SAS behavior.

Blob:

- Remove the default value for the `BlobSequenceNumber` parameter in the Swagger definition.
- Allow quoted tag keys containing spaces and `+`, `-`, `.`, `/`, `:`, or `=` in blob tag filter conditions to match Azure Storage behavior. (issue #2561)

Queue:

- Migrate queue test suites to modern Azure SDK clients (`@azure/storage-queue`).

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
