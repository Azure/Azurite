import { Readable, ReadableOptions } from "stream";

const zeroBytesRangeUnit = 512;
const zeroBytesChunk: Buffer = Buffer.alloc(zeroBytesRangeUnit);

export default class ZeroBytesStream extends Readable {
  private leftBytes: number;

  public constructor(
    public readonly length: number,
    options?: ReadableOptions
  ) {
    super(options);
    this.leftBytes = length;
  }

  public _read(size: number): void {
    if (this.leftBytes === 0) {
      this.push(null);
    } else if (this.leftBytes >= zeroBytesRangeUnit) {
      this.leftBytes -= zeroBytesRangeUnit;
      this.push(zeroBytesChunk);
    } else {
      process.nextTick(() => {
        this.push(Buffer.alloc(this.leftBytes));
        this.leftBytes = 0;
      });
    }
  }
}
