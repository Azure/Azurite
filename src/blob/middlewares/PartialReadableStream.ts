import { Readable, ReadableOptions } from "stream";

/**
 * A Node.js ReadableStream will only return partial content of the internal readable.
 *
 * @class PartialReadableStream
 * @extends {Readable}
 */
export class PartialReadableStream extends Readable {
  private dataLeft?: Buffer;

  public constructor(
    private source: NodeJS.ReadableStream,
    private threshold: number = 1024,
    options?: ReadableOptions
  ) {
    super(options);
    source.pause();

    this.setSourceDataHandler();
    this.setSourceEndHandler();
    this.setSourceErrorHandler();
    this.setSourceCloseHandler();
  }

  public _read() {
    this.source.resume();
  }

  private setSourceDataHandler() {
    this.source.on("data", (data: Buffer) => {
      if (this.dataLeft) {
        this.threshold -= this.dataLeft.length;
        if (!this.push(this.dataLeft)) {
          this.source.pause();
        }

        // Got enough data.
        if (this.threshold <= 0) {
          this.push(null);
          this.destroy();
          return;
        }
      }
      this.dataLeft = data;
    });
  }

  private setSourceEndHandler() {
    this.source.on("end", () => {
      if (this.threshold > 0) {
        if (!this.dataLeft || this.dataLeft.length < 2) {
          this.push(null);
        } else {
          const len = Math.min(this.dataLeft.length - 1, this.threshold);
          this.push(Buffer.from(this.dataLeft, 0, len));
          this.push(null);
        }
        this.threshold = 0;
      }
      this.destroy();
    });
  }

  private setSourceErrorHandler() {
    this.source.on("error", error => {
      this.destroy(error);
    });
  }

  private setSourceCloseHandler() {
    this.source.on("close", () => {
      if (!this.destroyed && this.threshold > 0) {
        this.destroy(new Error("stream closed unexpectly."));
      }
    });
  }

  _destroy(error: Error | null, callback: (error?: Error) => void): void {
    // release source
    (this.source as Readable).destroy();
    callback(error === null ? undefined : error);
  }
}
