import assert from "assert";
import { Readable } from "stream";
import FSExtentStore from "../../src/common/persistence/FSExtentStore";
import IExtentMetadataStore from "../../src/common/persistence/IExtentMetadataStore";
import { DEFAULT_BLOB_PERSISTENCE_ARRAY } from "../../src/blob/utils/constants";
import logger from "../../src/common/Logger";

import { instance, mock, when, anything } from "ts-mockito";

describe("FSExtentStore", () => {

  const metadataStoreMock: IExtentMetadataStore = mock<IExtentMetadataStore>();
  when(metadataStoreMock.getExtentLocationId(anything())).thenResolve("Default");
  when(metadataStoreMock.isInitialized()).thenReturn(true);
  when(metadataStoreMock.isClosed()).thenReturn(false);
  when(metadataStoreMock.updateExtent(anything())).thenResolve();
  const metadataStore: IExtentMetadataStore = instance(metadataStoreMock);

  async function readIntoString(readable: NodeJS.ReadableStream): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
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

  it("should handle destroyed input stream during appendExtent @loki", async () => {
    const store = new FSExtentStore(metadataStore, DEFAULT_BLOB_PERSISTENCE_ARRAY, logger);
    await store.init();

    const stream = Readable.from("Test", { objectMode: false });
    stream.destroy();

    await assert.rejects(
      store.appendExtent(stream),
      new Error(`FSExtentStore:streamPipe() Readable stream is not readable.`)
    );
  });

  it("should append and read back a sliced Buffer @loki", async () => {
    const store = new FSExtentStore(metadataStore, DEFAULT_BLOB_PERSISTENCE_ARRAY, logger);
    await store.init();

    const source = Buffer.from("xHelloy");
    const extent = await store.appendExtent(source.subarray(1, 6));
    assert.strictEqual(extent.offset, 0);
    assert.strictEqual(extent.count, 5);

    const readable = await store.readExtent(extent);
    assert.strictEqual(await readIntoString(readable), "Hello");
  });

  it("should merge multiple extents into a single readable stream @loki", async () => {
    const store = new FSExtentStore(metadataStore, DEFAULT_BLOB_PERSISTENCE_ARRAY, logger);
    await store.init();

    const extent1 = await store.appendExtent(Buffer.from("Hello"));
    const extent2 = await store.appendExtent(Buffer.from(" "));
    const extent3 = await store.appendExtent(Buffer.from("World"));
    const originalReadExtent = store.readExtent.bind(store);
    let extentReadCalls = 0;
    let activeExtentStreams = 0;
    let maxActiveExtentStreams = 0;
    store.readExtent = async (extentChunk, contextId) => {
      extentReadCalls++;
      const stream = await originalReadExtent(extentChunk, contextId);
      activeExtentStreams++;
      maxActiveExtentStreams = Math.max(
        maxActiveExtentStreams,
        activeExtentStreams
      );
      let isActive = true;
      const deactivate = () => {
        if (isActive) {
          activeExtentStreams--;
          isActive = false;
        }
      };
      // Only "close" releases the file descriptor; "end" and "error" fire
      // earlier while it may still be open, so counting them would hide a
      // regression that opens the next extent before the previous one closes.
      stream.once("close", deactivate);
      return stream;
    };

    try {
      const merged = await store.readExtents(
        [extent1, extent2, extent3],
        0,
        extent1.count + extent2.count + extent3.count
      );

      assert.ok(
        extentReadCalls <= 1,
        "Only the first extent may begin opening before consumption; later extents must be deferred"
      );
      assert.strictEqual(await readIntoString(merged), "Hello World");
      assert.strictEqual(extentReadCalls, 3, "Every extent should be read");
      assert.strictEqual(
        maxActiveExtentStreams,
        1,
        "At most one extent stream should be active at a time"
      );
    } finally {
      store.readExtent = originalReadExtent;
    }
  });

  it("should read a range that spans multiple extents @loki", async () => {
    const store = new FSExtentStore(metadataStore, DEFAULT_BLOB_PERSISTENCE_ARRAY, logger);
    await store.init();

    const extent1 = await store.appendExtent(Buffer.from("Hello"));
    const extent2 = await store.appendExtent(Buffer.from(" "));
    const extent3 = await store.appendExtent(Buffer.from("World"));

    const merged = await store.readExtents([extent1, extent2, extent3], 3, 5);

    assert.strictEqual(await readIntoString(merged), "lo Wo");
  });

  it("should destroy an extent opened after the merged stream is destroyed @loki", async () => {
    const store = new FSExtentStore(metadataStore, DEFAULT_BLOB_PERSISTENCE_ARRAY, logger);
    await store.init();

    const extent1 = await store.appendExtent(Buffer.from("Hello"));
    const extent2 = await store.appendExtent(Buffer.from("World"));

    const originalReadExtent = store.readExtent.bind(store);

    // Hold the first extent open until the merged stream has been destroyed, so
    // the extent finishes opening after the abort and the guard must discard it.
    let releaseOpen!: () => void;
    const openGate = new Promise<void>(resolve => (releaseOpen = resolve));
    let markClosed!: () => void;
    const openedStreamClosed = new Promise<void>(resolve => (markClosed = resolve));
    let openedStream: Readable | undefined;

    store.readExtent = async (extentChunk, contextId) => {
      await openGate;
      openedStream = (await originalReadExtent(extentChunk, contextId)) as Readable;
      openedStream.once("close", markClosed);
      return openedStream;
    };

    try {
      const merged = await store.readExtents(
        [extent1, extent2],
        0,
        extent1.count + extent2.count
      );

      // Destroy the merged stream directly (a programmatic teardown; a raw
      // client disconnect is handled elsewhere, see issue #2804).
      (merged as Readable).destroy();
      releaseOpen(); // let the first extent finish opening into the abort guard
      await openedStreamClosed; // the guard destroyed it and released the fd

      assert.ok(openedStream, "the first extent should have opened");
      assert.strictEqual(
        (openedStream as Readable).destroyed,
        true,
        "an extent opened after the merged stream is destroyed must be destroyed, not leaked"
      );
    } finally {
      store.readExtent = originalReadExtent;
    }
  });
});
