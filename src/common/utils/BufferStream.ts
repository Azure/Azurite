import { Readable } from "stream";

export default class BufferStream extends Readable {
  private buffer: Buffer;
  private offset: number;
  private chunkSize: number;
  private bufferSize: number;

  constructor(buffer: Buffer, options?: any) {
    super(options);
    this.buffer = buffer;
    this.offset = 0;
    this.chunkSize = 64 * 1024;
    this.bufferSize = buffer.length;
  }

  public _read() {
    while (this.push(this._readNextChunk())) {
      continue;
    }
  }

  private _readNextChunk(): Buffer | null {
    let data = null;
    if (this.offset < this.bufferSize) {
      let end = this.offset + this.chunkSize;
      end = end > this.bufferSize ? this.bufferSize : end;
      data = this.buffer.slice(this.offset, end);
      this.offset = end;
    }
    return data;
  }
}
