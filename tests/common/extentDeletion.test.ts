import assert from "assert";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import LokiExtentMetadataStore from "../../src/common/persistence/LokiExtentMetadataStore";
import MemoryExtentStore, {
  MemoryExtentChunkStore
} from "../../src/common/persistence/MemoryExtentStore";
import logger from "../../src/common/Logger";

// Counts per-extent and batch metadata deletes on a real Loki metadata store.
function countDeletes(metadataStore: LokiExtentMetadataStore) {
  const calls = { single: 0, batch: 0 };
  const deleteExtent = metadataStore.deleteExtent.bind(metadataStore);
  const deleteExtents = metadataStore.deleteExtents.bind(metadataStore);
  metadataStore.deleteExtent = async (id: string) => {
    calls.single++;
    return deleteExtent(id);
  };
  metadataStore.deleteExtents = async (ids: string[]) => {
    calls.batch++;
    return deleteExtents(ids);
  };
  return calls;
}

async function listExtentIds(
  metadataStore: LokiExtentMetadataStore
): Promise<string[]> {
  const [extents] = await metadataStore.listExtents(undefined, 1 << 30);
  return extents.map((extent) => extent.id).sort();
}

describe("Extent deletion", () => {
  let dir: string;
  let metadataStore: LokiExtentMetadataStore;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "azurite-extent-deletion-"));
    metadataStore = new LokiExtentMetadataStore(join(dir, "extents.json"), true);
    await metadataStore.init();
  });

  afterEach(async () => {
    await metadataStore.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("LokiExtentMetadataStore.deleteExtents removes only the given extents @loki", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 100; i++) {
      const id = `extent-${i}`;
      ids.push(id);
      await metadataStore.updateExtent({
        id,
        locationId: "Default",
        path: id,
        size: 1,
        lastModifiedInMS: Date.now()
      });
    }
    const removed = ids.filter((_, i) => i % 3 === 0);
    const kept = ids.filter((_, i) => i % 3 !== 0);

    await metadataStore.deleteExtents([]);
    assert.strictEqual((await listExtentIds(metadataStore)).length, 100);

    await metadataStore.deleteExtents(removed);

    assert.deepStrictEqual(await listExtentIds(metadataStore), kept.sort());
    // Lookups through the id index still work after the batch removal.
    for (const id of kept) {
      assert.strictEqual(await metadataStore.getExtentLocationId(id), "Default");
    }
  });

  it("MemoryExtentStore.deleteExtents removes chunks and metadata with one batch metadata delete @loki", async () => {
    const chunks = new MemoryExtentChunkStore(1 << 20);
    const store = new MemoryExtentStore(
      "blob",
      chunks,
      metadataStore,
      logger,
      (_statusCode, _errorCode, errorMessage) => new Error(errorMessage)
    );
    await store.init();
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) {
      ids.push((await store.appendExtent(Buffer.from("x"))).id);
    }
    const removed = ids.slice(0, 30);
    const kept = ids.slice(30);
    const calls = countDeletes(metadataStore);

    assert.strictEqual(await store.deleteExtents(removed), 30);

    assert.deepStrictEqual(calls, { single: 0, batch: 1 });
    assert.deepStrictEqual(await listExtentIds(metadataStore), kept.sort());
    for (const id of removed) {
      assert.strictEqual(chunks.get("blob", id), undefined);
    }
    for (const id of kept) {
      assert.notStrictEqual(chunks.get("blob", id), undefined);
    }
    await store.close();
  });
});
