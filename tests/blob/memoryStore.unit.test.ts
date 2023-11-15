import assert = require("assert");
import { IMemoryExtentChunk, MemoryExtentChunkStore, SharedChunkStore } from "../../src/common/persistence/MemoryExtentStore";
import { totalmem } from "os";

function chunk(id: string, count: number, fill?: string): IMemoryExtentChunk {
  return {
    id,
    chunks: [Buffer.alloc(count, fill)],
    count: count,
    offset: 0,
  }
}

describe("MemoryExtentChunkStore", () => {

  it("should limit max size with try set @loki", () => {
    const store = new MemoryExtentChunkStore(1000);
    store.set("blob", chunk("a", 1000))

    assert.strictEqual(false, store.trySet("blob", chunk("b", 1)))
  });

  it("updates current size for add @loki", () => {
    const store = new MemoryExtentChunkStore(1000);

    store.set("blob", chunk("a", 555))
    store.set("blob", chunk("b", 1))
    store.set("blob", chunk("c", 123))

    assert.strictEqual(679, store.totalSize())
  });

  it("updates current size based on count property @loki", () => {
    const store = new MemoryExtentChunkStore(1000);

    store.set("blob", {
      id: "a",
      chunks: [Buffer.alloc(10, "a"), Buffer.alloc(20, "b")],
      count: 15, // a lie, for testing
      offset: 0
    })

    assert.strictEqual(15, store.totalSize())
  });

  it("updates current size for delete @loki", () => {
    const store = new MemoryExtentChunkStore(1000);
    store.set("blob", chunk("a", 555))
    store.set("blob", chunk("b", 1))
    store.set("blob", chunk("c", 123))

    store.delete("blob", "b")

    assert.strictEqual(678, store.totalSize())
  });

  it("allows size limit to be updated @loki", () => {
    const store = new MemoryExtentChunkStore(1000);
    store.set("blob", chunk("a", 20))

    store.setSizeLimit(50)

    assert.throws(
      () => store.set("blob", chunk("b", 31)),
      /Cannot add an extent chunk to the in-memory store. Size limit of 50 bytes will be exceeded./)
  });

  it("prevents size limit from being set lower than the current size @loki", () => {
    const store = new MemoryExtentChunkStore(1000);
    store.set("blob", chunk("a", 20))

    assert.strictEqual(false, store.setSizeLimit(19))
    assert.strictEqual(1000, store.sizeLimit())
  });

  it("updates current size with delta when ID is replaced @loki", () => {
    const store = new MemoryExtentChunkStore(1000);
    store.set("blob", chunk("a", 555))
    store.set("blob", chunk("b", 1))

    store.set("blob", chunk("a", 123))

    assert.strictEqual(124, store.totalSize())
  });

  it("resets current size for clear @loki", () => {
    const store = new MemoryExtentChunkStore(1000);
    store.set("blob", chunk("a", 555))
    store.set("blob", chunk("b", 1))
    store.set("blob", chunk("c", 123))

    store.clear("blob")

    assert.strictEqual(0, store.totalSize())
  });

  it("replaces buffers if ID is existing @loki", () => {
    const store = new MemoryExtentChunkStore(1000);
    store.set("blob", chunk("a", 11, "0"))

    store.set("blob", chunk("a", 12, "1"))

    const existing = store.get("blob", "a")
    assert.strictEqual(1, existing?.chunks.length)
    assert.deepStrictEqual(Buffer.alloc(12, "1"), existing?.chunks[0])
  });

  it("keeps categories separate for set and delete @loki", () => {
    const store = new MemoryExtentChunkStore(1000);
    store.set("queue", chunk("a", 12, "0"))
    store.set("blob", chunk("a", 11, "1"))

    store.delete("blob", "a")

    const existing = store.get("queue", "a")
    assert.deepStrictEqual([Buffer.alloc(12, "0")], existing?.chunks)
    assert.strictEqual(12, store.totalSize())
  });

  it("only clears a single category at a time @loki", () => {
    const store = new MemoryExtentChunkStore(1000);
    store.set("queue", chunk("a", 12, "0"))
    store.set("blob", chunk("a", 11, "1"))

    store.clear("queue")

    assert.strictEqual(11, store.totalSize())
  });

  it("can clear all categories clears a single category at a time @loki", () => {
    const store = new MemoryExtentChunkStore(1000);
    store.set("queue", chunk("a", 12, "0"))
    store.set("blob", chunk("a", 11, "1"))

    store.clear("queue")
    store.clear("blob")

    assert.strictEqual(0, store.totalSize())
    assert.strictEqual(undefined, store.get("queue", "a"))
    assert.strictEqual(undefined, store.get("blob", "a"))
  });

  it("all categories contribute to the same limit @loki", () => {
    const store = new MemoryExtentChunkStore(1000);
    store.set("queue", chunk("a", 50, "0"))
    store.set("blob", chunk("a", 50, "1"))

    const success = store.trySet("queue", chunk("b", 925))

    assert.strictEqual(false, success)
    assert.strictEqual(100, store.totalSize())
  });

  it("allows deletion by ID @loki", () => {
    const store = new MemoryExtentChunkStore(1000);
    store.set("blob", chunk("a", 11, "0"))

    store.delete("blob", "a")

    const existing = store.get("blob", "a")
    assert.strictEqual(undefined, existing)
  });

  it("should have a shared instance defaulting to close to 50% of the total bytes @loki", () => {
    assert.ok(SharedChunkStore.sizeLimit(), "The default store's size limit should be set.")
    assert.ok(SharedChunkStore.sizeLimit()! > 0.49 * totalmem())
    assert.ok(SharedChunkStore.sizeLimit()! < 0.51 * totalmem())
  });
});
