import { OutgoingHttpHeaders, STATUS_CODES } from "http";
import IResponse from "../generated/IResponse";
import { SubResponseTextBodyStream } from "./SubResponseTextBodyStream";

export class BlobBatchSubResponse implements IResponse {
  private statusCode: number | undefined;
  private statusMessage: string | undefined;
  private headers: { [header: string]: string | string[] | undefined };
  private bodyStream: SubResponseTextBodyStream;

  public constructor(
    public readonly content_id: number | undefined,
    public readonly protocolWithVersion: string
  ) {
    this.headers = {};
    this.bodyStream = new SubResponseTextBodyStream(this);
  }

  public setStatusCode(code: number): IResponse {
    this.statusCode = code;
    return this;
  }

  public getStatusCode(): number {
    return this.statusCode!;
  }

  public setStatusMessage(message: string): IResponse {
    this.statusMessage = message;
    return this;
  }

  public getStatusMessage(): string {
    return this.statusMessage || "";
  }

  public setHeader(
    field: string,
    value?: string | string[] | undefined | number | boolean
  ): IResponse {
    if (typeof value === "number") {
      value = `${value}`;
    }

    if (typeof value === "boolean") {
      value = `${value}`;
    }

    // Cannot remove if block because of a potential TypeScript bug
    if (typeof value === "string" || value instanceof Array) {
      this.headers[field] = value;
    }
    return this;
  }

  public getHeader(field: string): number | string | string[] | undefined {
    return this.headers[field];
  }

  public getHeaders(): OutgoingHttpHeaders {
    return this.headers;
  }

  public headersSent(): boolean {
    return false;
  }

  public setContentType(value: string): IResponse {
    this.setHeader("content-type", value);
    return this;
  }

  public getBodyStream(): NodeJS.WritableStream {
    return this.bodyStream;
  }

  public getBodyContent(): string{
    return this.bodyStream.getBodyContent();
  }

  public end(): void{
    this.setStatusMessage(STATUS_CODES[this.statusCode!] || 'unknown');
  }
}