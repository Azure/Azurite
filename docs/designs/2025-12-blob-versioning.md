# Add Blob Versioning Support

- Author Name: Rodolfo Orozco Vasquez ([@rorozcov](https://github.com/rorozcov))
- GitHub Issue: [Azure/Azurite#665](https://github.com/Azure/Azurite/issues/665)

## Summary

This design adds Azure Blob Storage versioning support to Azurite. When versioning is enabled for an account, Azurite keeps previous values of a blob when supported operations modify or delete the current value. Applications can list, read, restore, and delete those previous versions during local development.

The implementation follows the [Azure Blob Storage versioning guidelines](https://learn.microsoft.com/en-us/azure/storage/blobs/versioning-overview) as closely as Azurite's supported feature set allows. Versioning is opt-in and disabled by default for an account with no persisted configuration. It is supported only by the default LokiJS metadata implementation and is not supported by the SQL metadata implementation.

## Plain-language overview

Without versioning, uploading `report.txt` again replaces the old value:

```text
Upload 1: report.txt = "Draft"
Upload 2: report.txt = "Final"

Stored result: "Final"
```

With versioning enabled, the old value remains available:

```text
Version 1: report.txt = "Draft"  (previous)
Version 2: report.txt = "Final"  (current)
```

The blob name does not change. Azurite distinguishes the records with a generated `versionId` and marks one record as the current version.

The simplest mental model is:

- The account model database answers: **Is versioning enabled for this account?**
- The blob metadata database answers: **Which versions exist, and which one is current?**
- The extent database answers: **Which physical data files exist?**
- The `__blobstorage__` directory contains: **The actual blob bytes.**

Versioning mainly changes blob metadata. Before an operation changes or removes the current blob, Azurite saves a copy of its metadata record as a previous version. The operation then updates or replaces the current record, which receives a new version ID.

## Motivation

Applications use Azure Blob versioning to recover from accidental overwrites and deletes, inspect history, and restore older content. Without equivalent behavior in Azurite, those applications cannot test their complete version-aware workflow locally before connecting to Azure.

## Goals

- Configure versioning independently for each Azurite storage account.
- Retain previous versions for Azure-compatible operations.
- Return Azure-compatible version IDs and response fields.
- List current and previous versions with deterministic pagination.
- Read, inspect, copy, and delete a specific version by its `versionId`.
- Preserve data written before versioning was enabled.
- Keep older Azurite name-only continuation markers working.
- Prevent garbage collection from deleting content referenced by any version.

## Non-goals

- Implement soft delete or integrate soft delete with versioning.
- Implement blob expiration or lifecycle management for versions.
- Implement version-specific SAS URIs.
- Implement version-level immutability policies (Version Level WORM).
- Add versioning to the SQL metadata implementation.
- Reproduce Azure's internal storage architecture. Azurite reproduces observable API behavior using its existing persistence model.

## Architecture at a glance

```mermaid
flowchart LR
    Client[Azure SDK, Storage Explorer, or REST client]
    HTTP[Express and generated middleware]
    Handler[Blob or Container handler]
    AccountStore[Account model store]
    MetadataStore[Blob metadata store]
    ExtentStore[Extent store]

    Client -->|HTTP request| HTTP
    HTTP -->|resolve versioning setting once per request| AccountStore
    HTTP -->|authenticate and dispatch with request context| Handler
    Handler -->|read or write metadata| MetadataStore
    Handler -->|read or write bytes| ExtentStore
    Handler -->|HTTP response| Client
```

`BlobRequestListenerFactory` creates the handlers and gives each handler the same metadata and extent stores. The blob storage context middleware resolves the account's versioning setting and carries it on the request context. The handlers implement REST operation behavior; `LokiBlobMetadataStore` owns the version lifecycle and metadata persistence, applying the setting from the request context; the extent store owns the actual bytes.

## Persistence model

LokiJS uses collections, which can be understood like tables in a relational database. A collection contains JSON documents, which can be understood like rows.

### Files and collections

| Physical location | LokiJS collection | Purpose |
| --- | --- | --- |
| `__azurite_db_account_models__.json` | `$ACCOUNT_MODEL_COLLECTION$` | Per-account feature settings, including the versioning switch |
| `__azurite_db_blob__.json` | `$SERVICES_COLLECTION$` | Blob service properties |
| `__azurite_db_blob__.json` | `$CONTAINERS_COLLECTION$` | Containers |
| `__azurite_db_blob__.json` | `$BLOBS_COLLECTION$` | Current blobs, previous versions, and snapshots |
| `__azurite_db_blob__.json` | `$BLOCKS_COLLECTION$` | Uncommitted block blob blocks |
| `__azurite_db_blob_extent__.json` | `$EXTENTS_COLLECTION$` | Extent IDs, sizes, and physical file locations |
| `__blobstorage__/` | Not applicable | Actual blob bytes on disk |

The paths are relative to Azurite's configured `--location`. In `--inMemoryPersistence` mode, equivalent information is kept in memory instead of these files.

### Account model document

The account setting is represented by:

```typescript
export interface AccountModel {
  key: string;
  isBlobVersioningEnabled: boolean;
}
```

An example persisted document is:

```json
{
  "key": "devstoreaccount1",
  "isBlobVersioningEnabled": true
}
```

Account names are normalized to lower case. If no persisted account model exists, versioning is disabled for that account. In disk-backed mode, an existing account model remains effective when a later startup omits configuration for that account.

### Blob version documents

There is no separate versions collection. Each version is another document in `$BLOBS_COLLECTION$`.

Conceptually, two uploads of the same blob produce:

| name | versionId | isCurrentVersion | persistency.id |
| --- | --- | --- | --- |
| `report.txt` | `2026-09-10T10:00:00.0000000Z` | `false` | `extent-a` |
| `report.txt` | `2026-09-10T11:00:00.0000000Z` | `true` | `extent-b` |

The `persistency` object is an address for the bytes. It contains an extent ID, offset, and byte count. This separation lets an old metadata document continue pointing to its old content after a new upload writes different content.

Snapshots also live in `$BLOBS_COLLECTION$`, but use the `snapshot` field instead of `versionId` as their external identifier.

## Configuration

Versioning is disabled by default for an account with no persisted configuration. Exactly one of these command-line options can configure it:

1. `--accountConfigFilePath`: load an account model from a JSON file.
2. `--accountConfigAsJson`: load an account model from an inline JSON value.

In disk-backed mode, supplied values are saved in `__azurite_db_account_models__.json`. On a later startup, omitting configuration for an account preserves its last saved value; explicitly set `isBlobVersioningEnabled` to `false` to disable versioning. With `--inMemoryPersistence`, account models are not retained across restarts.

### Single account

The account name may be omitted for the default `devstoreaccount1` account:

```bash
azurite --accountConfigAsJson '{"isBlobVersioningEnabled":true}'
```

Or use a file:

```bash
azurite --accountConfigFilePath './myAccountModel.json'
```

```json
{
  "isBlobVersioningEnabled": true
}
```

### Multiple accounts

Different accounts can use different settings:

```bash
azurite --accountConfigAsJson 'account1:{"isBlobVersioningEnabled":true},account2:{"isBlobVersioningEnabled":false}'
```

File-based configuration uses an account-name prefix for each path:

```bash
azurite --accountConfigFilePath 'account1:/path/config1.json,account2:/path/config2.json'
```

The same options are available through the VS Code extension:

- `azurite.accountConfigFilePath`
- `azurite.accountConfigAsJson`

### Authentication is separate

The account model controls behavior; it does not create credentials. Every custom account must also be present in the `AZURITE_ACCOUNTS` environment variable so requests can authenticate.

```text
AccountModel:      Should this account retain blob versions?
AZURITE_ACCOUNTS:  Which account names and keys may authenticate?
```

See [Customized Storage Accounts & Keys](../../README.md#customized-storage-accounts--keys-1).

## Startup flow

```mermaid
flowchart TD
    Args[CLI options or VS Code settings]
    Parse[EnvironmentFunctions.parseAccountModelFlags]
    AccountDB[LokiAccountModelStore]
    Factory[BlobServerFactory]
    Server[BlobServer]
    BlobDB[LokiBlobMetadataStore]
    ExtentDB[LokiExtentMetadataStore]
    Bytes[FSExtentStore or MemoryExtentStore]
    Listener[BlobRequestListenerFactory]

    Args --> Parse --> AccountDB --> Factory --> Server
    Server --> BlobDB
    Server --> ExtentDB
    Server --> Bytes
    Server --> Listener
```

The file flow is:

```text
src/common/EnvironmentFunctions.ts
  -> src/blob/main.ts or src/azurite.ts
  -> src/common/account/LokiAccountModelStore.ts
  -> src/blob/BlobServerFactory.ts
  -> src/blob/BlobServer.ts
  -> src/blob/BlobRequestListenerFactory.ts
```

For LokiJS, `BlobServer` receives the account model store through its configuration and creates the blob metadata store, extent metadata store, and disk- or memory-based byte store. If `AZURITE_DB` selects SQL metadata and the startup configuration enables versioning for any account, `BlobServerFactory` rejects startup with an explanatory error. In SQL mode, Azurite neither writes nor initializes `__azurite_db_account_models__.json`; the file describes Loki data, so an existing file that enables versioning only produces a warning and does not block startup.

The account model store is not passed to `LokiBlobMetadataStore`. Instead, `BlobServer` gives `BlobRequestListenerFactory` a resolver backed by the account model store. The blob storage context middleware calls it once per request, after the account name is parsed, and stores the result as `BlobStorageContext.isBlobVersioningEnabled`. `LokiBlobMetadataStore` only reads that flag from the request context, so the metadata store applies the account policy but never looks it up. Blob batch sub-requests inherit the value already resolved for the batch request's account. When the flag is absent (SQL mode, or a context that was never resolved), versioning is treated as off.

## Request flows

### First upload

For a block blob upload such as `report.txt = "Draft"`:

```mermaid
flowchart TD
    Request[PUT Blob request]
    Middleware[Parse, validate, and authenticate]
    Handler[BlockBlobHandler.upload]
    WriteBytes[ExtentStore.appendExtent]
    ExtentMetadata[Save extent metadata]
    Model[Build BlobModel]
    Create[LokiBlobMetadataStore.createBlob]
    Setting[Read account versioning setting]
    Version[Generate versionId]
    Insert[Insert current document in BLOBS collection]
    Response[Return 201 and x-ms-version-id]

    Request --> Middleware --> Handler --> WriteBytes --> ExtentMetadata
    ExtentMetadata --> Model --> Create --> Setting --> Version --> Insert --> Response
```

The main file flow is:

```text
src/blob/BlobRequestListenerFactory.ts
  -> src/blob/handlers/BlockBlobHandler.ts
  -> src/common/persistence/FSExtentStore.ts
  -> src/common/persistence/LokiExtentMetadataStore.ts
  -> src/blob/persistence/LokiBlobMetadataStore.ts
```

`BlockBlobHandler` writes the request body before it creates the metadata document. The returned extent address becomes the new blob document's `persistency` value. When versioning is enabled, `createBlob` assigns a version ID, marks the document current, and returns that version ID in the response.

Page and append blob creation follow the same ownership boundaries through `PageBlobHandler` and `AppendBlobHandler`.

### Overwrite

For a second upload such as `report.txt = "Final"`:

```mermaid
flowchart TD
    NewBytes[Write new bytes and receive extent-b]
    Find[Find current report.txt document]
    Type[Verify all committed versions use the same blob type]
    Keep{Versioning enabled, or old document has a versionId?}
    Archive[Save a copy of the old document as a previous version]
    Remove[Remove old current document]
    Stamp[Set versionId: a new ID if enabled, empty otherwise]
    Insert[Insert new current document pointing to extent-b]

    NewBytes --> Find --> Type --> Keep
    Keep -->|Yes| Archive --> Remove
    Keep -->|No| Remove
    Remove --> Stamp --> Insert
```

The old content is not copied during this metadata transition. The previous version keeps the reference to `extent-a`, and the new document points to `extent-b`. Operations that update the current document in place, such as Set Blob Metadata and Commit Block List, follow the same rule but update the current document in place instead of removing and inserting it.

Azurite enforces Azure's same-blob-type rule across the history. For example, a page blob cannot replace a block blob while committed versions of that name exist.

### List versions

A client requests versions with the REST equivalent of:

```http
GET /devstoreaccount1/documents?restype=container&comp=list&include=versions
```

```mermaid
flowchart TD
    Request[Container List Blobs request]
    Handler[ContainerHandler]
    Include[Recognize include=versions]
    Decode[Decode continuation marker]
    Query[Query BLOBS collection]
    Sort[Sort by name, timestamp, recordId]
    Page[PageWithDelimiter fills one page]
    Token[Encode next marker if more records exist]
    XML[Return Azure-compatible XML]

    Request --> Handler --> Include --> Decode --> Query --> Sort --> Page --> Token --> XML
```

The file flow is:

```text
src/blob/handlers/ContainerHandler.ts
  -> src/blob/persistence/LokiBlobMetadataStore.ts
  -> src/blob/persistence/PageWithDelimiter.ts
  -> src/blob/persistence/BlobListMarker.ts
```

Without `include=versions`, previous versions are hidden and normal listing returns only the current blob. With the option, each version can appear with `VersionId`; the current item also has `IsCurrentVersion=true`. `include=deletedwithversions` is not supported and is ignored (see [Known limitations](#known-limitations)).

### Continuation markers

List results are limited to a page size, so Azurite returns a continuation marker when more results exist. Clients must treat that marker as an opaque bookmark and return it unchanged.

Blob names alone are insufficient because several versions have the same name. A separator-based token is also unsafe because the separator could legally appear inside a blob name. The marker therefore contains the complete stable ordering tuple:

```text
[name, timestamp, recordId]
```

- `name` groups records by blob name.
- `timestamp` orders a blob's versions, snapshots, and current value. It is the version ID or snapshot time. A record with neither, such as the current blob when versioning is not used, gets a fixed value that sorts last, because Azure lists a blob's snapshots and versions before the blob itself. A fixed value also keeps the record's position stable when the blob changes during paging.
- `recordId` resolves ties when two records have the same name and timestamp. It is `$loki` for LokiJS and `blobId` for SQL.

`BlobListMarker.ts` serializes a versioned payload and encodes it with base64url:

```typescript
interface BlobListMarkerV1 {
  v: 1;
  name: string;
  timestamp: string;
  recordId: number;
}
```

The same tuple comparison is used to sort results, filter records after a supplied marker, and generate the next marker. This prevents skipped or duplicated records. Older Azurite markers that contain only a plain blob name are accepted as legacy markers and mean "continue after every record with this name."

The garbage collector uses the same marker codec for transport but pages its internal listing by `[name, recordId]`; its timestamp field is empty because internal GC ordering has different requirements from the public REST listing.

### Download a specific version

A client selects an old value with `versionid`:

```http
GET /devstoreaccount1/documents/report.txt?versionid=2026-09-10T10:00:00.0000000Z
```

```mermaid
flowchart TD
    Request[GET Blob with versionid]
    Handler[BlobHandler.download]
    Validate[Validate versionId and snapshot parameters]
    Find[Find account, container, name, and versionId]
    Address[Read persistency extent address]
    Bytes[ExtentStore reads the referenced bytes]
    Response[Return the selected version]

    Request --> Handler --> Validate --> Find --> Address --> Bytes --> Response
```

The main file flow is:

```text
src/blob/handlers/BlobHandler.ts
  -> src/blob/persistence/LokiBlobMetadataStore.ts
  -> src/common/persistence/FSExtentStore.ts
```

When no `versionid` or snapshot is supplied, the metadata store selects the document whose `isCurrentVersion` is not `false`. A request cannot specify both `versionid` and `snapshot`.

### Delete

Deletion has different behavior depending on whether the request supplies a version ID.

#### Delete the current blob without `versionid`

Azurite saves the current document as a previous version and removes the current document. No current blob remains, so a normal download returns not found, but version-specific downloads continue to work.

```text
Before delete:
  Version 1 -> previous
  Version 2 -> current

After delete:
  Version 1 -> previous
  Version 2 -> previous
  Current blob -> none
```

Uploading the same name later creates a new current version without removing the retained history.

#### Delete a previous version with `versionid`

Azurite removes only the matching historical document from `$BLOBS_COLLECTION$`. Other versions are unaffected. Azure does not allow deleting the current version by supplying its version ID; the root blob must be deleted instead.

Snapshot deletion rules remain separate. Supplying `versionid` together with a snapshot or `deleteSnapshots` option is invalid.

### Restore a version

Azure restoration is a copy operation rather than a special "restore" API. The client uses the previous version as a copy source and copies it onto the base blob. The old version remains, and the copy operation creates a new current version containing the restored data.

### Create a snapshot

A snapshot and a version are different resources. When versioning is enabled, Create Snapshot:

1. Inserts the requested snapshot.
2. Saves the current blob as a previous version and gives the current blob a new version ID. The current blob's content, metadata, ETag, Last-Modified, and lease do not change.
3. Returns both the snapshot timestamp and the new version ID.

## Operations that create versions

The following table summarizes the intended Azure-compatible behavior when versioning is enabled.

| Operation | Creates a version? | Notes |
| --- | --- | --- |
| Put Blob / Put Blob From URL / create blob | Yes | Covers block, page, and append blob creation or overwrite |
| Put Block | No | Stages an uncommitted block only |
| Put Block List / Commit Block List | Yes | Every commit creates a new current version |
| Set Blob Metadata | Yes | Preserves the previous metadata state |
| Set Blob Properties / HTTP Headers | No | Updates properties without creating a version |
| Copy Blob / Copy From URL | Yes | Versions the destination blob |
| Create Snapshot | Yes, in addition to the snapshot | Creates both resources when versioning is enabled |
| Put Page | No | Updates page content in place |
| Append Block | No | Appends content in place |
| Set Blob Tags | No | Tags remain associated with the selected version |
| Set Blob Tier | No | A tier can be changed independently for a selected version |

Previous versions cannot be modified by ordinary blob write operations. Operations that Azure permits for a selected version, such as reading tags or changing access tier, target only that version.

## Version ID generation

Version IDs use Azure's seven-fractional-digit timestamp form:

```text
2026-09-10T10:30:45.1230000Z
```

JavaScript dates provide millisecond precision, which accounts for the first three fractional digits. Azurite uses the remaining four digits as a per-blob counter so repeated operations in the same millisecond still receive unique IDs:

```text
2026-09-10T10:30:45.1230000Z
2026-09-10T10:30:45.1230001Z
2026-09-10T10:30:45.1230002Z
```

`LokiBlobMetadataStore.generateVersionId` checks existing versions and snapshots for the same account, container, blob, and millisecond. It supports up to 10,000 generated values for one blob in one millisecond.

A blob created before versioning was enabled has no version ID. When it becomes a previous version, Azurite uses the blob's creation time as its version ID, as Azure does.

## Changing the versioning setting

In disk-backed mode, the account model is persisted and can be updated when Azurite restarts with new configuration.

- **Enabled to disabled:** Existing versions remain readable. New supported writes stop creating versions and update the current value using non-versioning behavior. If the current blob still has a version ID, the next write, snapshot, or delete keeps it as a previous version, and the current blob then has no version ID.
- **Disabled to enabled:** Existing blob data remains usable. The next supported write begins retaining history and assigns version IDs as required.
- **Enabled, then omitted at restart:** If the account has a persisted model, it remains enabled. Omission does not reset the saved value.
- **Disabled, then omitted at restart:** If the account has a persisted model, it remains disabled.
- **Never configured:** If no persisted model exists for the account, versioning is disabled by default.
- **In-memory persistence:** Account models do not survive a restart, so an account with no newly supplied configuration starts with versioning disabled. Blob data and version history are also not retained in this mode.

Turning versioning off does not delete existing versions.

## Garbage collection and data safety

Removing a blob metadata document does not necessarily remove its physical extent immediately. `BlobGCManager` finds unreferenced extents and deletes them later.

```mermaid
flowchart TD
    Start[Blob GC starts]
    List[BlobReferredExtentsAsyncIterator lists all blobs]
    Versions[Include current blobs, versions, snapshots, and blocks]
    References[Collect every referenced extent ID]
    Compare[Compare references with EXTENTS collection]
    Used{Referenced anywhere?}
    Keep[Keep extent]
    Delete[Delete unreferenced extent]

    Start --> List --> Versions --> References --> Compare --> Used
    Used -->|Yes| Keep
    Used -->|No| Delete
```

`LokiBlobMetadataStore.listAllBlobs` sorts by blob name and Loki record ID so pagination can visit more than 5,000 versions that share one blob name. If GC skipped versions on a page boundary, it could mistake their live content for unused data. The stable internal marker prevents that data-loss scenario.

## Authentication and authorization

Versioning does not bypass or replace Azurite authentication. Requests still pass through the existing public access, Shared Key, account SAS, blob SAS, and optional OAuth authenticators before reaching handlers.

The current limitation is that Azurite does not generate or validate SAS URIs scoped to a specific blob version. Normal authenticated version operations continue through the existing authorization pipeline.

## Error and validation behavior

The implementation preserves existing lease and conditional-request checks and adds version-specific validation:

- Reject a version ID that is not a real date and time with seven fraction digits (for example `2023-02-30T10:00:00.0000000Z`) with `400 InvalidQueryParameterValue`. A copy source whose `snapshot` is not such a value returns `400 InvalidHeaderValue`, as Azure does.
- Reject requests that specify both `snapshot` and `versionid`.
- Reject deletion options that combine a version ID with snapshot behavior.
- Return Blob Not Found when the requested version does not exist.
- Prevent ordinary write operations from mutating previous versions.
- Keep a lease on the current blob only. Previous versions have no lease, so deleting one does not require the current blob's lease ID.
- Enforce one committed blob type across all versions of a blob name, including versions kept after versioning is disabled.
- Reject enabling versioning with SQL metadata storage. Because SQL metadata never keeps versions, a request for a specific version ID, including a copy source with `versionid`, returns `404 BlobNotFound`, as Azure does for a version that does not exist.

## Code ownership map

| Area | Main files | Responsibility |
| --- | --- | --- |
| Account model | `src/common/account/AccountModel.ts`, `LokiAccountModelStore.ts` | Represent, persist, normalize, and query account settings |
| Configuration parsing | `src/common/EnvironmentFunctions.ts`, `src/blob/BlobEnvironment.ts` | Parse CLI and VS Code account configuration |
| Server construction | `src/blob/BlobServerFactory.ts`, `src/blob/BlobServer.ts` | Select Loki or SQL and wire stores into the service |
| HTTP routing and authentication | `src/blob/BlobRequestListenerFactory.ts` | Build middleware, authenticators, and handlers |
| Per-request versioning flag | `src/blob/middlewares/blobStorageContext.middleware.ts`, `src/blob/context/BlobStorageContext.ts` | Resolve the account's versioning setting once per request and expose it to the metadata store |
| REST behavior | `src/blob/handlers/BlobHandler.ts`, `BlockBlobHandler.ts`, `PageBlobHandler.ts`, `AppendBlobHandler.ts`, `ContainerHandler.ts` | Validate requests and build responses |
| Version metadata | `src/blob/persistence/LokiBlobMetadataStore.ts` | Generate IDs and create, find, list, copy, and delete versions |
| Public pagination | `src/blob/persistence/BlobListMarker.ts`, `PageWithDelimiter.ts` | Encode stable opaque markers and build pages |
| Blob bytes | `src/common/persistence/FSExtentStore.ts`, `MemoryExtentStore.ts` | Store and retrieve actual content |
| Extent metadata | `src/common/persistence/LokiExtentMetadataStore.ts` | Map extent IDs to physical storage |
| Garbage collection | `src/blob/persistence/BlobReferredExtentsAsyncIterator.ts`, `BlobGCManager.ts` | Retain referenced extents and delete unused ones |

## Compatibility and limitations

### Azure behavior alignment

- Versioning is an account-level setting.
- Version IDs are generated automatically and use timestamp syntax.
- Supported overwrites preserve previous versions.
- Previous versions can be listed and addressed with `versionid`.
- Deleting the root blob leaves no current version but retains its version history.
- All committed versions of one blob name have the same blob type.
- Public continuation markers are opaque and deterministic.

### Known limitations

- Versioning works only with LokiJS metadata, not `AZURITE_DB` SQL metadata.
- Soft delete and blob expiration are not integrated with versioning.
- Version-specific SAS URIs are not supported.
- Version-level immutability policies are not supported.
- List Blobs `include=deletedwithversions` is accepted but ignored. Azure returns one `HasVersionsOnly=true` entry per deleted blob that still has versions; Azurite returns nothing for such blobs unless `include=versions` is also requested.
- Azurite's timestamps use JavaScript time plus a local per-blob counter. They reproduce the external seven-digit shape, but not Azure's internal clock implementation.
- Blob batch sub-requests inherit the versioning setting resolved for the batch request's account, and use "disabled" for any other account. Azure takes the account only from the batch request: it ignores the host of a sub-request URL and resolves the sub-request path against the batch's account, so a batch can never change another account. With path-style URLs, the account is part of the sub-request path, and Azurite runs a sub-request that names a different account against that account. In that case a delete in an account with versioning enabled does not keep a blob that has no version ID as a previous version. Rejecting such sub-requests, or resolving them against the batch's account as Azure does, would remove the gap but change existing batch behavior, so it is left out of this change. Clients should send each batch to the account that owns its blobs.

## Testing strategy

Coverage is split by responsibility:

- Account model tests verify persistence, account normalization, single- and multi-account parsing, and setting changes.
- Loki metadata tests verify version creation, lookup, deletion, snapshots, transitions, and GC pagination.
- Block, page, and append blob API tests verify operation-specific behavior and response version IDs.
- Shared contract tests exercise the same visible lifecycle expected from Azure.
- Hierarchy contract tests verify prefixes and continuation markers when several versions share a name.
- Blob type tests verify that history cannot mix committed block, page, and append blob types.
- Pagination tests cover opaque markers, unusual blob names, equal timestamps, legacy name-only markers, and page boundaries.
- Production parity tests are manual because changing versioning on a real Azure account requires external setup.

The relevant suites live under:

```text
tests/common/LokiAccountModelStore.test.ts
tests/blob/lokidb.test.ts
tests/blob/pagewithdelimiter.test.ts
tests/blob/apis/*versioning*.test.ts
tests/blob/apis/blob.versioning.contract.test.ts
tests/blob/apis/blob.versioning.hierarchy.contract.test.ts
tests/blob/apis/blobtype.versioning.test.ts
```

## Design decisions and alternatives

### Reuse `$BLOBS_COLLECTION$`

Storing each version as a blob document reuses existing lookup, lease, property, and extent behavior. A separate versions collection would require duplicate schemas and cross-collection coordination for most operations.

### Keep bytes separate from metadata

Azurite already stores bytes in extents. Keeping version records as references avoids copying old bytes merely to turn a current blob into a previous version.

### Use timestamp IDs with a counter

Random IDs would be unique but would not match Azure's externally visible timestamp format. Milliseconds alone can collide, so the final four fractional digits provide deterministic local uniqueness.

### Use structured opaque continuation markers

A plain blob name cannot identify one result among many same-name versions. Concatenating fields with a delimiter is ambiguous because a legal blob name can contain that delimiter. Versioned base64url JSON is unambiguous, URL-safe, extensible, and stateless.

### Keep SQL unsupported initially

The SQL metadata schema and query paths require separate migrations and parity validation. Rejecting the configuration at startup is safer than silently providing partial version behavior.

## Azure references

- [Blob versioning overview](https://learn.microsoft.com/en-us/azure/storage/blobs/versioning-overview)
- [Enable and manage blob versioning](https://learn.microsoft.com/en-us/azure/storage/blobs/versioning-enable)
- [List Blobs REST API](https://learn.microsoft.com/en-us/rest/api/storageservices/list-blobs)
- [Versioning and snapshots](https://learn.microsoft.com/en-us/azure/storage/blobs/versions-snapshots-overview)

## Future possibilities

- Add SQL metadata schema and query support for versions.
- Integrate versions with soft delete and lifecycle expiration.
- Add version-scoped SAS support.
- Add version-level immutability policies.
- Add automated live-Azure parity infrastructure for account-level setting transitions.
