import { ReadStream, createReadStream } from "fs";
import { Readable } from "stream";
import ILogger from "../ILogger";


export default class FileLazyReadStream extends Readable {
  private extentStream: ReadStream | undefined;
  constructor(
    private readonly extentPath: string,
    private readonly start: number,
    private readonly end: number,
    private readonly logger: ILogger,
    private readonly persistencyId: string,
    private readonly extentId: string,
    private readonly contextId?: string) {
    super();
  }

  public _read(): void {
    if (this.extentStream === undefined) {
      this.extentStream = createReadStream(this.extentPath, {
        start: this.start,
        end: this.end
      }).on("close", () => {
        this.logger.verbose(
          `FSExtentStore:readExtent() Read stream closed. LocationId:${this.persistencyId} extentId:${this.extentId
          } path:${this.extentPath} offset:${this.start} end:${this.end}`,
          this.contextId
        );
      });
      this.setSourceEventHandlers();
    }
    this.extentStream?.resume();
  }

  private setSourceEventHandlers() {
    this.extentStream?.on("data", this.sourceDataHandler);
    this.extentStream?.on("end", this.sourceErrorOrEndHandler);
    this.extentStream?.on("error", this.sourceErrorOrEndHandler);
  }

  private removeSourceEventHandlers() {
    this.extentStream?.removeListener("data", this.sourceDataHandler);
    this.extentStream?.removeListener("end", this.sourceErrorOrEndHandler);
    this.extentStream?.removeListener("error", this.sourceErrorOrEndHandler);
  }

  private sourceDataHandler = (data: Buffer) => {
    if (!this.push(data)) {
      this.extentStream?.pause();
    }
  }

  private sourceErrorOrEndHandler = (err?: Error) => {
    if (err && err.name === "AbortError") {
      this.destroy(err);
      return;
    }

    this.removeSourceEventHandlers();
    this.push(null);
    this.destroy(err);
  }

  _destroy(error: Error | null, callback: (error?: Error) => void): void {
    // remove listener from source and release source
    //this.removeSourceEventHandlers();
    (this.extentStream as Readable).destroy();

    callback(error === null ? undefined : error);
  }
}