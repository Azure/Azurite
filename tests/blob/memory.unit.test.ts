import assert = require("assert");
import { IMemoryExtentChunk, MemoryExtentChunkStore } from "../../src/common/persistence/MemoryExtentStore";

function chunk(id: string, count: number, fill?: string): IMemoryExtentChunk {
  return {
    id,
    chunks: [Buffer.alloc(count, fill)],
    count: count,
    offset: 0,
  }
}

describe("MemoryExtentChunkStore", () => {

  it("should limit max size should work", () => {
    const store = new MemoryExtentChunkStore(1000);
    store.set(chunk("a", 1000))

    assert.throws(
      () => store.set(chunk("b", 1)),
      /Cannot add an extent chunk to the in-memory store. Size limit of 1000 bytes will be exceeded./)
  });

  it("updates current size for add", () => {
    const store = new MemoryExtentChunkStore(1000);

    store.set(chunk("a", 555))
    store.set(chunk("b", 1))
    store.set(chunk("c", 123))

    assert.strictEqual(679, store.totalSize())
  });

  it("updates current size based on count property", () => {
    const store = new MemoryExtentChunkStore(1000);

    store.set({
      id: "a",
      chunks: [Buffer.alloc(10, 'a'), Buffer.alloc(20, 'b')],
      count: 15, // a lie, for testing
      offset: 0
    })

    assert.strictEqual(15, store.totalSize())
  });

  it("updates current size for delete", () => {
    const store = new MemoryExtentChunkStore(1000);
    store.set(chunk("a", 555))
    store.set(chunk("b", 1))
    store.set(chunk("c", 123))

    store.delete("b")

    assert.strictEqual(678, store.totalSize())
  });

  it("updates current size with delta when ID is replaced", () => {
    const store = new MemoryExtentChunkStore(1000);
    store.set(chunk("a", 555))
    store.set(chunk("b", 1))

    store.set(chunk("a", 123))

    assert.strictEqual(124, store.totalSize())
  });

  it("resets current size for clear", () => {
    const store = new MemoryExtentChunkStore(1000);
    store.set(chunk("a", 555))
    store.set(chunk("b", 1))
    store.set(chunk("c", 123))

    store.clear()

    assert.strictEqual(0, store.totalSize())
  });

  it("replaces buffers if ID is existing", () => {
    const store = new MemoryExtentChunkStore(1000);
    store.set(chunk("a", 11, '0'))

    store.set(chunk("a", 12, '1'))

    const existing = store.get('a')
    assert.strictEqual(1, existing?.chunks.length)
    assert.deepStrictEqual(Buffer.alloc(12, '1'), existing?.chunks[0])
  });

  it("allows deletion by ID", () => {
    const store = new MemoryExtentChunkStore(1000);
    store.set(chunk("a", 11, '0'))

    store.delete("a")

    const existing = store.get('a')
    assert.strictEqual(undefined, existing)
  });
});
