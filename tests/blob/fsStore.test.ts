import assert from "assert";
import { Readable } from "stream";
import FSExtentStore from "../../src/common/persistence/FSExtentStore";
import IExtentMetadataStore from "../../src/common/persistence/IExtentMetadataStore";
import { DEFAULT_BLOB_PERSISTENCE_ARRAY } from "../../src/blob/utils/constants";
import logger from "../../src/common/Logger";

import { mock } from "ts-mockito";

describe("FSExtentStore", () => {

  const metadataStore: IExtentMetadataStore = mock<IExtentMetadataStore>();
  metadataStore.getExtentLocationId = () => Promise.resolve("Default");

  it("should handle input stream error gracefully during appendExtent @loki", async () => {
    const store = new FSExtentStore(metadataStore, DEFAULT_BLOB_PERSISTENCE_ARRAY, logger);
    await store.init();

    // A null value within the Readable.from array causes the stream to emit an error.
    const stream1 = Readable.from(["deadbeef", null], { objectMode: false });
    await assert.rejects(store.appendExtent(stream1));

    // Write a valid stream to the store.
    const stream2 = Readable.from("Test", { objectMode: false });
    const extent = await store.appendExtent(stream2);
    assert.strictEqual(extent.offset, 0);
    assert.strictEqual(extent.count, 4);

    // Check that the extent is readable.
    let readable = await store.readExtent(extent);
    const chunks: Buffer[] = [];
    for await (const chunk of readable) {
      chunks.push(chunk as Buffer);
    }
    const data = Buffer.concat(chunks);
    assert.strictEqual(data.toString(), "Test");
  });
});
