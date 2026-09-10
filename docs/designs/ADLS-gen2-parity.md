# ADLS Gen2 Parity Implementation Plan

## Context

Azurite previously had a **thin DFS proxy layer** on a dedicated port (10004) that translated a small subset of ADLS Gen2 DFS REST API calls to Blob REST API calls via HTTP proxying (axios). This covered only filesystem (container) create/delete/HEAD and account listing. Full ADLS Gen2 parity requires native support for path (file/directory) operations, the append-then-flush write pattern, rename/move, ACLs, and list paths — none of which can be achieved by simple query-parameter rewriting.

## Architectural Decision: Hybrid (Native DFS Handlers + Shared Port)

Replace the HTTP proxy with a **native Express pipeline** mounted inside `BlobRequestListenerFactory` that directly accesses `IBlobMetadataStore` and `IExtentStore` — the same store instances used by the blob handlers. DFS and Blob share a single listener on port 10000; routing is done by URL prefix inside the existing server.

```
Port 10000
  ├─ /devstoreaccount1/<container>?resource=filesystem  →  DFS Handlers  →  IBlobMetadataStore + IExtentStore
  ├─ /devstoreaccount1/<container>/<path>               →  DFS Handlers  →  same stores
  └─ everything else                                    →  Blob Handlers →  same stores
```

There is no separate DFS server or dedicated DFS port. `--dfsHost` / `--dfsPort` CLI flags and the `azurite.dfsHost` / `azurite.dfsPort` VS Code settings have been removed.

**Why not keep proxying?** DFS operations like List Paths, Create Directory, Rename, ACLs, and append-then-flush have no single blob API equivalent. Proxying would require multi-call orchestration, lose atomicity, and add latency.

**Why shared port instead of separate listener?** The DFS and Blob APIs share the same account/container/blob namespace. A separate listener would require passing live store references across server boundaries and duplicating TLS/auth/logging configuration. Mounting DFS routing inside the existing server is simpler and keeps all requests to a single endpoint — matching how Azure itself exposes both APIs on `*.blob.core.windows.net` / `*.dfs.core.windows.net` (separate hostnames but the same backing infrastructure).

### Directory Model

Directories stored as **zero-length BlockBlobs with `hdi_isfolder=true` metadata** — matching Azure's real internal behavior. No separate table needed.

### ACL Storage

New fields on `BlobModel`: `dfsAclOwner`, `dfsAclGroup`, `dfsAclPermissions`, `dfsAcl`. LokiJS is schemaless (just add fields); SQL needs ALTER TABLE.

---

## Phase 0: Foundation — Shared Store Access & HNS Flag

**Goal:** Wire DFS server to share stores with blob server; enable HNS mode.

| File | Change |
|------|--------|
| `src/blob/utils/constants.ts` | Set `EMULATOR_ACCOUNT_ISHIERARCHICALNAMESPACEENABLED = true` (or make configurable) |
| `src/blob/BlobServer.ts` | Expose `metadataStore`, `extentStore`, and `accountDataStore` via public getters |
| `src/blob/BlobRequestListenerFactory.ts` | Mount `DfsRequestListenerFactory` as a sub-router on DFS URL patterns |
| `src/blob/DfsRequestListenerFactory.ts` | Rewrite: replace axios proxy with native Express pipeline + DFS routing |
| `src/blob/IBlobEnvironment.ts`, `BlobEnvironment.ts`, `src/common/Environment.ts`, `VSCEnvironment.ts` | Add `--enableHierarchicalNamespace` option; remove `--dfsHost`/`--dfsPort` |

**Deliverable:** DFS requests are served on the blob port; existing filesystem tests pass via direct store access. No separate DFS listener or port.

---

## Phase 1: Path CRUD + List Paths

**Goal:** Create/delete/read files and directories, list paths — the core operations most ADLS Gen2 SDKs depend on.

### New files to create

| File | Purpose |
|------|---------|
| `src/blob/dfs/DfsContext.ts` | DFS request context (account, filesystem, path) — analogous to `BlobStorageContext` |
| `src/blob/dfs/DfsOperation.ts` | Enum of DFS operations for dispatch |
| `src/blob/dfs/DfsDispatchMiddleware.ts` | Routes requests by `resource` param, `action` param, method, and headers |
| `src/blob/dfs/DfsErrorFactory.ts` | JSON error responses (`PathNotFound`, `DirectoryNotEmpty`, etc.) |
| `src/blob/dfs/DfsSerializer.ts` | JSON response serialization (DFS uses JSON, not XML) |
| `src/blob/dfs/handlers/FilesystemHandler.ts` | Filesystem ops → container store operations |
| `src/blob/dfs/handlers/PathHandler.ts` | Path create/delete/read/getProperties + listPaths |

### Operations implemented

- **Create Path** (`PUT ?resource=file|directory`): Creates zero-length BlockBlob; directories get `hdi_isfolder=true` metadata; auto-creates intermediate directories
- **Delete Path** (`DELETE`): Files → `deleteBlob()`; directories with `recursive=true` → delete all blobs with prefix; `recursive=false` → 409 if non-empty
- **Get Path Properties** (`HEAD`): Returns `x-ms-resource-type: file|directory` header
- **Read Path** (`GET`): Streams file content via `downloadBlob()` (follows `BlobHandler.download()` pattern)
- **List Paths** (`GET ?resource=filesystem&directory=...&recursive=true|false`): JSON response with `paths` array; uses `listBlobs()` with prefix/delimiter; supports continuation via `x-ms-continuation`

### Existing files modified

| File | Change |
|------|--------|
| `src/blob/persistence/IBlobMetadataStore.ts` | Add `dfsResourceType`, ACL fields to `BlobModel` / `IBlobAdditionalProperties` |
| `src/blob/persistence/LokiBlobMetadataStore.ts` | No schema changes needed (schemaless) |
| `src/blob/persistence/SqlBlobMetadataStore.ts` | Add columns: `dfsResourceType`, `dfsAclOwner`, `dfsAclGroup`, `dfsAclPermissions`, `dfsAcl` |

### Tests

Extend `tests/blob/dfsProxy.test.ts`:
- Create file / directory, verify as blob
- Delete file / empty dir / non-empty dir with recursive
- Get properties with `x-ms-resource-type`
- Read file content
- List paths recursive and non-recursive
- Cross-API: create via DFS → read via Blob API and vice versa

---

## Phase 2: Append-Flush Write Pattern

**Goal:** Implement the DFS file write model (create empty → append chunks → flush to commit).

### Key insight

DFS append-then-flush maps directly to existing **BlockBlob uncommitted blocks** infrastructure: each `action=append` becomes a `stageBlock()`, and `action=flush` becomes `commitBlockList()`. No new persistence methods needed.

### Changes to `src/blob/dfs/handlers/PathHandler.ts`

- **`updatePath_Append(position, body)`**: Write body to `IExtentStore` as extent chunk; record as uncommitted block via `metadataStore.stageBlock()`; validate `position` matches current append offset; return 202
- **`updatePath_Flush(position, close)`**: Commit all staged blocks via `metadataStore.commitBlockList()`; update content length to `position`; return 200 with updated ETag

### Tests

- Create → append 3 chunks → flush → read back, verify content
- Append with wrong position → 400
- Large file (multi-MB) append

---

## Phase 3: Rename/Move Path

**Goal:** Atomic rename for files and directories.

### New persistence methods

| Method | Description |
|--------|-------------|
| `IBlobMetadataStore.renameBlob(src, dest)` | Atomic rename of single blob (metadata-only, no extent copy) |
| `IBlobMetadataStore.renameBlobsByPrefix(srcPrefix, destPrefix)` | Atomic rename of all blobs matching prefix (for directory rename) |

### PathHandler addition

- **`renamePath(x-ms-rename-source)`**: Parse source header → for files: `renameBlob()`; for directories: `renameBlobsByPrefix()`. Supports cross-filesystem rename and conditional headers.

### Persistence implementations

- **LokiJS**: Update document `containerName` and `name` properties
- **SQL**: `UPDATE ... SET name = REPLACE(name, oldPrefix, newPrefix) WHERE name LIKE 'prefix%'` in transaction

### Tests

- Rename file within filesystem / across filesystems
- Rename directory (verify children moved)
- Rename non-existent → 404
- Rename with conditional headers

---

## Phase 4: ACL Operations

**Goal:** POSIX ACL get/set for emulator parity.

### PathHandler additions

- **`getAccessControl()`**: Read ACL fields from blob record → return as `x-ms-owner`, `x-ms-group`, `x-ms-permissions`, `x-ms-acl` headers. Defaults: `$superuser`/`$superuser`/`rwxr-x---`
- **`setAccessControl(owner, group, permissions, acl)`**: Validate ACL format → update blob record
- **`setAccessControlRecursive(mode, acl)`**: `mode` = set|modify|remove; iterate blobs under prefix; support continuation; return JSON with `directoriesSuccessful`, `filesSuccessful`, `failureCount`

### Tests

- Set/get ACL on file and directory
- Recursive ACL set on directory tree
- Default ACL values on new paths

---

## Phase 5: Polish & Remaining Operations

- **Set Filesystem Properties** (`PATCH ?resource=filesystem`) → `setContainerMetadata()`
- **`x-ms-properties` encoding/decoding** — new `src/blob/dfs/DfsPropertyEncoding.ts` utility (base64 key=value pairs)
- **DFS JSON error format**: `{"error":{"code":"...","message":"..."}}`
- **Lease support** on DFS paths (reuse blob lease infrastructure)
- **SAS validation** on DFS endpoints (reuse existing authenticators)
- **Content-MD5/CRC64 validation** on append

---

## Verification Plan

1. **Unit tests**: Extend `tests/blob/dfsProxy.test.ts` per phase
2. **Cross-API tests**: Verify DFS-created data is visible via Blob API and vice versa
3. **SDK integration**: Test with `@azure/storage-file-datalake` Node.js SDK against the emulator
4. **Manual smoke test**: Run Azurite, use Azure Storage Explorer with DFS endpoint
5. **Existing blob tests**: Ensure `npm test` still passes (no regression)

---

## Critical Reference Files

- `src/blob/handlers/ContainerHandler.ts` — pattern for handler ↔ store interaction
- `src/blob/handlers/BlockBlobHandler.ts` — `stageBlock`/`commitBlockList` for append-flush reuse
- `src/blob/handlers/BlobHandler.ts` — `download()` pattern for Read Path
- `src/blob/persistence/IBlobMetadataStore.ts` — store interface to extend
- `src/blob/generated/handlers/` — handler interface patterns
- `src/blob/middlewares/blobStorageContext.middleware.ts` — context extraction pattern for DfsContext
