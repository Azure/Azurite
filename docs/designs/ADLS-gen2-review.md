# ADLS Gen2 PR — Code Review

Internal review of branch `jsavard/adls-gen2`. Issues ordered by severity.

Legend: ✅ Fixed | 🔲 Pending

---

## Pass 1 — All Fixed (commit c2f6204)

| ID | Summary | Status |
|----|---------|--------|
| C-1 | `flushData` loses data on second flush cycle | ✅ |
| C-2 | HNS hierarchy rows leaked on container delete | ✅ |
| C-3 | `FilesystemHandler.getProperties` returns wrong HNS flag | ✅ |
| C-4 | `FilesystemHandler.getProperties` leaks `azurite_hns_enabled` in `x-ms-properties` | ✅ |
| C-5 | `PathHandler.create` missing ACL enforcement | ✅ |
| C-6 | `checkApiVersion` synchronous throw in DFS context middleware | ✅ |
| M-1 | Rename silently overwrites destination / no non-empty-dir guard | ✅ |
| M-2 | `setProperties` allows overwriting internal metadata keys | ✅ |
| M-3 | `safeGetBlobProperties` swallows all errors, not just 404 | ✅ |
| M-4 | `getAccountInfo` — unhandled 404 from `getContainerProperties` | ✅ |
| M-5 | SQL bulk rename — constraint violation surfaced as 500 | ✅ |
| M-6 | Batch delete — no 404 tolerance for concurrent deletes | ✅ |
| M-7 | LIKE patterns — user-controlled paths not escaping `%` and `_` | ✅ |
| M-8 | Custom ETags don't match Azure `"0x..."` format | ✅ |
| m-1 | Dead code: `renameBlob`, `renameBlobsByPrefix`, `renameHnsPaths`, etc. | ✅ |
| m-2 | `failureCount` always 0 in `setAccessControlRecursive` | ✅ |
| m-3 | `FilesystemHandler.setProperties` allows overwriting `azurite_hns_enabled` | ✅ |
| m-4 | Stream error in `read` after headers sent | ✅ |
| m-5 | `maxResults`/`maxRecords` not validated for NaN/negative | ✅ |
| m-6 | `ensureIntermediateDirectories` called after `renamePathAtomic` | ✅ |
| m-7 | User-agent sniffing — documented limitation | ✅ |
| m-8 | Named group ACL ignored — documented limitation | ✅ |

---

## Pass 2 — Current findings (commit 86c3eba baseline)

---

## Critical

### [C-1] `flushData` loses data on second flush cycle
**File:** `src/blob/dfs/handlers/PathHandler.ts` ~line 595

`commitBlockList` is built only from the current batch of uncommitted blocks, not the previously-committed ones. After `append→flush→append→flush`, the second flush wipes out the first flush's data.

**Fix:** Prepend `blob.committedBlocksInOrder` (as `Committed` entries) to the commit list before calling `commitBlockList`:
```ts
const previouslyCommitted = (blob.committedBlocksInOrder || []).map(b => ({
  blockName: b.name,
  blockCommitType: "Committed"
}));
const commitList = [
  ...previouslyCommitted,
  ...sortedBlocks.map(b => ({ blockName: b.name, blockCommitType: "Uncommitted" }))
];
```

**Test gap:** No test covers two complete `append→flush` cycles on the same file.

---

### [C-2] HNS hierarchy rows leaked on container/filesystem delete
**Files:** `src/blob/persistence/SqlBlobMetadataStore.ts`, `src/blob/persistence/LokiBlobMetadataStore.ts` — `deleteContainer`

Both stores clean up blobs and blocks but never delete the matching `HnsHierarchy` rows. Re-creating a container with the same name inherits stale hierarchy entries.

**Fix:** Add a `HnsHierarchy` delete-by-container step inside `deleteContainer` (within the existing transaction for SQL, immediately after blob removal for Loki).

---

### [C-3] `FilesystemHandler.getProperties` returns server-wide HNS flag, ignores per-container value
**File:** `src/blob/dfs/handlers/FilesystemHandler.ts` line 108

Returns `String(this.enableHierarchicalNamespace)` instead of reading `container.metadata["azurite_hns_enabled"]`.

**Fix:**
```ts
const hns = result.metadata?.["azurite_hns_enabled"] === "true" ||
  (result.metadata?.["azurite_hns_enabled"] === undefined && this.enableHierarchicalNamespace);
res.setHeader("x-ms-namespace-enabled", String(hns));
```

---

### [C-4] `FilesystemHandler.getProperties` leaks `azurite_hns_enabled` in `x-ms-properties`
**File:** `src/blob/dfs/handlers/FilesystemHandler.ts` lines 110-117

No `internalKeys` filter unlike `PathHandler.getProperties`. Clients receive and may round-trip the reserved key, corrupting the HNS flag.

**Fix:** Filter `azurite_hns_enabled` before building the `x-ms-properties` header:
```ts
const internalKeys = new Set(["azurite_hns_enabled"]);
const properties = Object.entries(result.metadata)
  .filter(([key]) => !internalKeys.has(key))
  .map(([key, value]) => `${key}=${Buffer.from(value).toString("base64")}`)
  .join(",");
```

---

### [C-5] `PathHandler.create` has no ACL enforcement
**File:** `src/blob/dfs/handlers/PathHandler.ts` lines 37-125

Every other operation (`delete`, `getProperties`, `read`, `listPaths`, `update`, `rename`) enforces ACL, but `create` does not. In `--oauth acl` mode, any authenticated caller can create files or directories anywhere.

**Fix:** Enforce write on the parent directory at the start of the non-rename path:
```ts
const parentPath = pathName.includes("/")
  ? pathName.substring(0, pathName.lastIndexOf("/"))
  : "";
if (!(await this.enforceAcl(ctx, res, account, filesystem, parentPath, "w"))) return;
```

---

### [C-6] `checkApiVersion` in DFS context middleware throws synchronously — crash risk
**File:** `src/blob/dfs/DfsContext.ts` lines 52-56

`checkApiVersion` can throw a `StorageError` synchronously inside a non-async `RequestHandler`. Express does not forward synchronous throws to the error handler, crashing the request.

**Fix:**
```ts
try {
  checkApiVersion(apiVersion, ValidAPIVersions, requestId);
} catch (error) {
  next(error);
  return;
}
```

---

## Major

### [M-1] `renamePath` silently overwrites or corrupts the destination if it already exists
**File:** `src/blob/dfs/handlers/PathHandler.ts` ~line 1005; `SqlBlobMetadataStore.ts` `renamePathAtomic`

No existence check before `renamePathAtomic`. The SQL path throws a unique-constraint violation returned as 500; Loki leaves a duplicate row.

**Fix:** Check destination existence and either delete it (overwrite semantics) or return `PathAlreadyExists`, within the same transaction.

**Test gap:** No test exercises rename to an already-existing destination.

---

### [M-2] `setProperties` allows overwriting internal metadata keys
**File:** `src/blob/dfs/handlers/PathHandler.ts` lines 783-822

User-controlled `x-ms-properties` pairs are merged into metadata without filtering. A client can overwrite `hdi_isfolder` (converting file↔directory) or ACL fields (`dfsAclOwner`, `dfsAclGroup`, etc.).

**Fix:** Block reserved keys during merge:
```ts
const reservedKeys = new Set(["hdi_isfolder", "dfsAclOwner", "dfsAclGroup", "dfsAclPermissions", "dfsAcl"]);
if (!reservedKeys.has(key)) {
  metadata[key] = value;
}
```

---

### [M-3] `safeGetBlobProperties` swallows all errors, not just 404
**File:** `src/blob/dfs/handlers/PathHandler.ts` lines 1202-1215

Any DB error is treated as "path not found". In `enforceAcl`, this means "allow" — store errors silently bypass ACL enforcement.

**Fix:** Only swallow `statusCode === 404`:
```ts
} catch (error: any) {
  if (error.statusCode === 404) return undefined;
  throw error;
}
```

---

### [M-4] `BlobHandler`/`ContainerHandler.getAccountInfo` can throw unhandled 404
**Files:** `src/blob/handlers/BlobHandler.ts` ~line 964; `src/blob/handlers/ContainerHandler.ts` ~line 848

`getContainerProperties` is called without try/catch. If the container was deleted between routing and handling, an unhandled 404 propagates.

**Fix:** Wrap in try/catch and fall back to the server-wide HNS default on 404.

---

### [M-5] SQL bulk rename may throw constraint violation as 500 on destination conflict
**File:** `src/blob/persistence/SqlBlobMetadataStore.ts` `renamePathAtomic`

No pre-check for duplicate destination names. Sequelize unique-constraint errors surface as generic 500.

**Fix:** Catch Sequelize constraint errors and map to `PathAlreadyExists`.

---

### [M-6] `Promise.all` batch delete has no 404 tolerance for concurrent deletes
**File:** `src/blob/dfs/handlers/PathHandler.ts` lines 163-170

If a child is deleted concurrently between `listBlobs` and the batch delete, the whole recursive delete fails.

**Fix:** Swallow 404 per-item:
```ts
.map(child =>
  this.metadataStore.deleteBlob(...).catch((e: any) => {
    if (e.statusCode !== 404) throw e;
  })
)
```

---

### [M-7] `LIKE` patterns use user-controlled paths without escaping `%` and `_`
**File:** `src/blob/persistence/SqlBlobMetadataStore.ts` lines 3707, 3756, 3828, 3882, 3922

A path containing `%` or `_` (SQL LIKE wildcards) would match unintended rows in rename, delete, and list queries.

**Fix:** Escape wildcards before building `LIKE` patterns:
```ts
const escapedPrefix = sourcePrefix.replace(/%/g, '\\%').replace(/_/g, '\\_');
```

---

### [M-8] ETags generated in PathHandler don't match Azure's `"0x..."` format
**File:** `src/blob/dfs/handlers/PathHandler.ts` lines 80, 601, 1099

Uses `` `"${new Date().getTime().toString(16)}"` `` producing short lowercase hex. SDK conditional-request validation may reject these.

**Fix:** Use `newEtag()` from `src/common/utils/utils.ts` at all three sites.

---

## Minor

### [m-1] Dead code: `isHnsDirectoryEmpty`, `hnsPathExists`, `renameBlob`, `renameBlobsByPrefix`
Declared in `IBlobMetadataStore`, implemented in both stores, never called from any handler. Remove or annotate with `// TODO`.

### [m-2] `failureCount` in `setAccessControlRecursive` always reports 0
**File:** `src/blob/dfs/handlers/PathHandler.ts` line 700 — declared as `const`, never incremented inside the per-path catch.
**Fix:** Change to `let failureCount = 0` and increment on error.

### [m-3] `FilesystemHandler.setProperties` allows overwriting `azurite_hns_enabled`
**File:** `src/blob/dfs/handlers/FilesystemHandler.ts` lines 178-190 — same issue as M-2 but for filesystem metadata. Filter the reserved key.

### [m-4] Stream errors in `read` after headers are sent
**File:** `src/blob/dfs/handlers/PathHandler.ts` lines 291-344 — `sendDfsError` called on an already-started response produces "Cannot set headers after they are sent".
**Fix:** Check `res.headersSent` and call `res.destroy(error)` instead.

### [m-5] `maxResults`/`maxRecords` not validated for NaN or negative values
**File:** `src/blob/dfs/handlers/PathHandler.ts` lines 354-356, 685-687 — `parseInt("garbage", 10)` returns `NaN`.
**Fix:** `Math.max(1, Math.min(5000, parseInt(..., 10) || 5000))`.

### [m-6] `ensureIntermediateDirectories` called after `renamePathAtomic` commits
**File:** `src/blob/dfs/handlers/PathHandler.ts` lines 1045-1060 — if intermediate-dir creation fails after a successful rename, the blob exists at the new path but the hierarchy is inconsistent.
**Fix:** Call `ensureIntermediateDirectories` before `renamePathAtomic`.

### [m-7] User-agent sniffing for DFS routing is fragile
**File:** `src/blob/BlobRequestListenerFactory.ts` lines 88-94 — any client whose UA contains "datalake" gets DFS routing regardless of intent.

### [m-8] Named group ACL entries silently ignored
**File:** `src/blob/dfs/DfsAclEnforcer.ts` lines 178-196 — `group:<id>:rwx` entries are parsed but never evaluated. Should at minimum be documented.

---

## Pass 1 — Test Gaps (all fixed in commit 86c3eba)

| # | Scenario | Status |
|---|----------|--------|
| 1 | Multi-cycle `append→flush→append→flush` | ✅ |
| 2 | Rename to existing destination | ✅ |
| 3 | ETag format validation (`"0x..."` pattern) | ✅ |
| 4 | `setProperties` with reserved key names | ✅ |
| 5 | Container/filesystem delete cleans up HNS hierarchy | ✅ (code only) |
| 6 | ACL enforcement blocks `create` when lacking parent write | ✅ |
| 7 | Non-numeric `?position=garbage` | ✅ |
| 8 | Path names containing `%` or `_` in SQL rename/delete | ✅ (code only) |

---

## Pass 2 — New Issues (baseline: commit 86c3eba)

### Critical

#### [P2-C-1] `FilesystemHandler.setProperties` wipes `azurite_hns_enabled` on every PATCH 🔲
**File:** `src/blob/dfs/handlers/FilesystemHandler.ts` lines 174–222  
**Problem:** `setProperties` builds metadata only from the request; never reads existing container metadata first. `setContainerMetadata` does a full replacement, so `azurite_hns_enabled` is erased on every `PATCH ?resource=filesystem`. Subsequent `getProperties` falls back to the server-wide flag.  
**Fix:** Read existing metadata with `getContainerProperties`, preserve `azurite_hns_enabled`, then overlay client-supplied properties before calling `setContainerMetadata`.

#### [P2-C-2] `ContainerHandler.setMetadata` (Blob API) also wipes `azurite_hns_enabled` 🔲
**File:** `src/blob/handlers/ContainerHandler.ts` lines 202–230  
**Problem:** `PUT ?comp=metadata` replaces the entire metadata map; `azurite_hns_enabled` is not preserved. A Blob SDK `SetContainerMetadata` call after creating an HNS container silently disables HNS.  
**Fix:** Same as P2-C-1 — read existing metadata and preserve the reserved key.

#### [P2-C-3] `azurite_hns_enabled` leaks as user-visible metadata via Blob API 🔲
**File:** `src/blob/handlers/ContainerHandler.ts` `getContainerProperties` ~line 133  
**Problem:** `GetContainerProperties` returns metadata unfiltered. SDK clients receive `x-ms-meta-azurite_hns_enabled` as a user metadata header, polluting the metadata map and enabling round-trip corruption.  
**Fix:** Filter `azurite_hns_enabled` from metadata in `getContainerProperties` response, mirroring `FilesystemHandler.getProperties`.

#### [P2-C-4] `x-ms-meta-azurite_hns_enabled` header lets clients forge the HNS flag 🔲
**File:** `src/blob/dfs/handlers/FilesystemHandler.ts` `extractMetadata` ~line 224  
**Problem:** `extractMetadata` reads all `x-ms-meta-*` headers verbatim, including `x-ms-meta-azurite_hns_enabled`. A client can send this header to disable HNS on any writable container. The `x-ms-properties` path already filters this key; the `x-ms-meta-*` path does not.  
**Fix:** In `extractMetadata`, skip the `azurite_hns_enabled` key.

---

### Major

#### [P2-M-1] `listPaths` returns `200 {paths:[]}` instead of `404` for non-existent directory 🔲
**File:** `src/blob/dfs/handlers/PathHandler.ts` lines 361–430  
**Problem:** When `?directory=nonexistent` is set and no blobs match, the response is `200 { paths: [] }`. Azure returns `404 PathNotFound`. DataLake SDK `listPaths` relies on 404 to detect missing directories.  
**Fix:** After `listBlobs`, if results are empty and `directory` was specified, check if the directory blob exists; if not, return `sendDfsError(res, pathNotFound(directory))`.

#### [P2-M-2] `PathHandler.delete` does not handle 412 conditional header mismatch 🔲
**File:** `src/blob/dfs/handlers/PathHandler.ts` lines 204–211  
**Problem:** The `catch` block only handles 404. A `deleteBlob` 412 (e.g., `If-Match` header mismatch) is logged and returned as 500 `InternalError`. `getProperties` handles 412 correctly.  
**Fix:** Add a 412 handler in the catch block, same pattern as `getProperties`.

#### [P2-M-3] `DfsContext` 400 response missing `x-ms-error-code` header 🔲
**File:** `src/blob/dfs/DfsContext.ts` lines 101–104  
**Problem:** Missing account name sends `res.status(400).json(...)` directly, bypassing `sendDfsError`. Azure SDKs require the `x-ms-error-code` header for structured error parsing.  
**Fix:** Replace with `sendDfsError(res, { statusCode: 400, code: "InvalidQueryParameterValue", message: "Account name is required." }); return;`

#### [P2-M-4] Multi-block read stream not destroyed on error — resource leak 🔲
**File:** `src/blob/dfs/handlers/PathHandler.ts` lines 319–329  
**Problem:** `stream.on("error", reject)` does not call `stream.destroy()`. The stream continues emitting after the Promise rejects, potentially writing to a closed response.  
**Fix:** `stream.on("error", (err) => { stream.destroy(); reject(err); });`

#### [P2-M-5] `x-ms-lease-break-period` NaN propagated to `breakBlobLease` 🔲
**File:** `src/blob/dfs/handlers/PathHandler.ts` `breakLease` ~line 953  
**Problem:** `parseInt(header, 10)` returns `NaN` for non-numeric values and is passed directly to `breakBlobLease`, producing undefined behavior instead of `400 InvalidHeaderValue`.  
**Fix:** Validate the parsed value; return 400 if NaN.

#### [P2-M-6] Concurrent appends at same position cause silent data loss 🔲
**File:** `src/blob/dfs/handlers/PathHandler.ts` lines 475–543  
**Problem:** Position check + `stageBlock` are not atomic. Two concurrent appends at `position=0` both pass the check, generate the same block ID, and the second overwrites the first. The first append's extent is leaked.  
**Fix:** Document as known limitation, or make position check + block stage a single atomic metadata operation.

#### [P2-M-7] `listPaths` returns hardcoded owner/group/permissions, ignoring stored ACL 🔲
**File:** `src/blob/dfs/handlers/PathHandler.ts` lines 394–413  
**Problem:** Every entry in `listPaths` response has `owner: "$superuser"`, `group: "$superuser"`, `permissions: "rwxr-x---"` regardless of stored ACL. ACL-aware applications reading from `listPaths` always see wrong data.  
**Fix:** Include `blob.metadata?.dfsAclOwner || "$superuser"` etc. per entry, or document as a known limitation.

---

### Minor

#### [P2-m-1] `dynamic require("crypto")` inside hot path 🔲
**File:** `src/blob/dfs/handlers/PathHandler.ts` `appendData` ~line 499  
**Fix:** Move to top-level `import { createHash } from "crypto"`.

#### [P2-m-2] `parentPath` variable shadowed inside `try` block 🔲
**File:** `src/blob/dfs/handlers/PathHandler.ts` lines 52 and 104  
**Problem:** Outer `parentPath` (ACL check, empty-string for root) and inner `parentPath` (HNS registration, `null` for root) have the same name but different semantics.  
**Fix:** Rename the inner variable to `hnsParentPath`.

#### [P2-m-3] `FilesystemHandler.setProperties` does not preserve existing user metadata 🔲
**File:** `src/blob/dfs/handlers/FilesystemHandler.ts` lines 182–207  
**Problem:** Beyond the HNS flag (P2-C-1), user metadata set via `x-ms-meta-*` on prior requests is also overwritten on every `PATCH ?resource=filesystem`.  
**Fix:** Read existing metadata and merge, overwriting only the keys from `x-ms-properties`.

#### [P2-m-4] Dispatch mis-routes `?resource=filesystem` + non-empty path 🔲
**File:** `src/blob/DfsRequestListenerFactory.ts` lines 87–90  
**Problem:** When `resource=filesystem` AND `ctx.path` is set, any HTTP method is mapped to `Filesystem_ListPaths`. A `PUT` with both conditions would silently become a list operation.  
**Fix:** Add a method check (`&& method === "GET"`) or return 400 for the combination.

#### [P2-m-5] `ensureIntermediateDirectories` accepts a file as a path component 🔲
**File:** `src/blob/dfs/handlers/PathHandler.ts` `ensureIntermediateDirectories` ~line 1128  
**Problem:** If `a/b` already exists as a file, the loop skips creating the directory entry and the create of `a/b/c` proceeds. Azure returns an error in this case.  
**Fix:** After `safeGetBlobProperties`, check if the existing entry is actually a directory; if not, return an appropriate error.

---

## Pass 2 — Test Gaps

| # | Scenario | Related issue |
|---|----------|---------------|
| 1 | `setProperties` PATCH then verify `x-ms-namespace-enabled` still correct | P2-C-1 |
| 2 | Blob API `SetContainerMetadata` then verify DFS still works | P2-C-2 |
| 3 | `GetContainerProperties` via Blob API does not expose `azurite_hns_enabled` | P2-C-3 |
| 4 | `listPaths ?directory=nonexistent` returns 404 | P2-M-1 |
| 5 | `delete` with non-matching `If-Match` returns 412 | P2-M-2 |
| 6 | `listPaths` returns correct `owner`/`group`/`permissions` after `setAccessControl` | P2-M-7 |
