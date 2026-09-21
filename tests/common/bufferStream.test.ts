import { strict as assert } from "assert";
import { Readable } from "stream";

import BufferStream from "../../src/common/utils/BufferStream";

// BufferStream is built on the Node.js "stream" and Buffer declarations, so it
// exercises the @types/node typings Azurite compiles against.
async function collect(stream: Readable): Promise<Buffer[]> {
  return new Promise<Buffer[]>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(chunks));
  });
}

describe("BufferStream @loki", () => {
  it("streams the full buffer content @loki", async () => {
    const source = Buffer.from("azurite buffer stream payload");

    const chunks = await collect(new BufferStream(source));

    assert.deepEqual(Buffer.concat(chunks), source);
  });

  it("splits large buffers into 64KB chunks @loki", async () => {
    const chunkSize = 64 * 1024;
    const source = Buffer.alloc(chunkSize + 512, 0x61);

    const chunks = await collect(
      new BufferStream(source, { highWaterMark: chunkSize })
    );

    assert.deepEqual(Buffer.concat(chunks), source);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].length, chunkSize);
    assert.equal(chunks[1].length, 512);
  });

  it("ends immediately for an empty buffer @loki", async () => {
    const chunks = await collect(new BufferStream(Buffer.alloc(0)));

    assert.equal(chunks.length, 0);
  });
});
