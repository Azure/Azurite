import { Request } from "express";

import IRequest, { HttpMethod } from "./IRequest";

export default class ExpressRequestAdapter implements IRequest {
  public constructor(private readonly req: Request) {}

  public getMethod(): HttpMethod {
    return this.req.method.toUpperCase() as HttpMethod;
  }

  public getUrl(): string {
    return this.req.url;
  }

  public getEndpoint(): string {
    return `${this.req.protocol}://${this.getHeader("host") ||
      this.req.hostname}`;
  }

  public getPath(): string {
    return this.req.path;
  }

  public getBodyStream(): NodeJS.ReadableStream {
    return this.req;
  }

  public getBody(): string | undefined {
    return this.req.body;
  }

  public setBody(body: string | undefined): ExpressRequestAdapter {
    this.req.body = body;
    return this;
  }

  public getHeader(field: string): string | undefined {
    return this.req.header(field);
  }

  public getHeaders(): { [header: string]: string | string[] | undefined } {
    return this.req.headers;
  }

  public getRawHeaders(): string[] {
    return this.req.rawHeaders;
  }

  public getQuery(key: string): string | undefined {
    return this.req.query[key];
  }

  public getProtocol(): string {
    return this.req.protocol;
  }
}
