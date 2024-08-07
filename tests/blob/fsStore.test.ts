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

  async function readIntoString(readable: NodeJS.ReadableStream): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of readable) {
      chunks.push(chunk as Buffer);
    }
    const buffer = Buffer.concat(chunks);
    return buffer.toString();
  }

  it("should handle input stream error gracefully during appendExtent @loki", async () => {
    const store = new FSExtentStore(metadataStore, DEFAULT_BLOB_PERSISTENCE_ARRAY, logger);
    await store.init();

    // Write a valid stream to the store.
    const stream1 = Readable.from("First", { objectMode: false });
    const extent1 = await store.appendExtent(stream1);
    assert.strictEqual(extent1.offset, 0);
    assert.strictEqual(extent1.count, 5);

    // A null value within the Readable.from array causes the stream to emit an error.
    const stream2 = Readable.from(["deadbeef", null], { objectMode: false });
    await assert.rejects(store.appendExtent(stream2));

    // Write another valid stream to the store.
    const stream3 = Readable.from("Test", { objectMode: false });
    const extent3 = await store.appendExtent(stream3);
    assert.strictEqual(extent3.offset, 5);
    assert.strictEqual(extent3.count, 4);

    // Check that the extents is readable.
    let readable1 = await store.readExtent(extent1);
    assert.strictEqual(await readIntoString(readable1), "First");
    let readable3 = await store.readExtent(extent3);
    assert.strictEqual(await readIntoString(readable3), "Test");
  });
});
