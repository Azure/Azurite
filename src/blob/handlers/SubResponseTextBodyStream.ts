import { Writable } from "stream";
import { BlobBatchSubResponse } from "./BlobBatchSubResponse";

export class SubResponseTextBodyStream extends Writable
{
  private bodyText: string;
  public constructor(
    private readonly subResponse: BlobBatchSubResponse) {
    super();
    this.bodyText = "";
  };

  public _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null | undefined) => void): void {
    this.bodyText += chunk.toString();
    callback();
  }

  public end(cb?: (() => void) | undefined): void;
  public end(chunk: any, cb?: (() => void) | undefined): void;
  public end(chunk: any, encoding: BufferEncoding, cb?: (() => void) | undefined): void;
  public end(chunk?: unknown, encoding?: unknown, cb?: unknown): void {
    if (chunk) this.bodyText += (chunk! as any).toString();
    this.subResponse.end();
  }

  public getBodyContent(): string {
    return this.bodyText;
  }
}