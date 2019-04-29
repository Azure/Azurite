import { Response } from "express";
import { OutgoingHttpHeaders } from "http";

import IResponse from "./IResponse";

export default class ExpressResponseAdapter implements IResponse {
  public constructor(private readonly res: Response) {}

  public setStatusCode(code: number): IResponse {
    this.res.status(code);
    return this;
  }

  public getStatusCode(): number {
    return this.res.statusCode;
  }

  public setStatusMessage(message: string): IResponse {
    this.res.statusMessage = message;
    return this;
  }

  public getStatusMessage(): string {
    return this.res.statusMessage;
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
      this.res.setHeader(field, value);
    }
    return this;
  }

  public getHeaders(): OutgoingHttpHeaders {
    return this.res.getHeaders();
  }

  public headersSent(): boolean {
    return this.res.headersSent;
  }

  public setContentType(value: string): IResponse {
    this.res.setHeader("content-type", value);
    return this;
  }

  public getBodyStream(): NodeJS.WritableStream {
    return this.res;
  }
}
