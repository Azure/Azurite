# ADLS Gen2 PR — Code Review

Internal review of branch `jsavard/adls-gen2`. Issues ordered by severity.

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

## Test Gaps

| # | Scenario | Related issue |
|---|----------|---------------|
| 1 | Multi-cycle `append→flush→append→flush` on the same file | C-1 |
| 2 | Rename to an already-existing destination | M-1 |
| 3 | ETag format validation (`"0x..."` pattern) | M-8 |
| 4 | `setProperties` with reserved key names (`hdi_isfolder`, ACL keys) | M-2 |
| 5 | Container/filesystem delete cleans up HNS hierarchy rows | C-2 |
| 6 | ACL enforcement blocks `create` when caller lacks write on parent | C-5 |
| 7 | Non-numeric `?position=garbage` on append/flush | m-5 |
| 8 | Path names containing `%` or `_` in SQL rename/delete | M-7 |
