import { URLBuilder } from "@azure/ms-rest-js";
import { Readable } from "stream";
import IRequest, { HttpMethod } from "../generated/IRequest";

export class BlobBatchSubRequest implements IRequest {
  private readonly urlbuilder: URLBuilder;

  public constructor(
    public readonly content_id: number,
    private readonly url: string,
    private readonly method: HttpMethod,
    public  readonly protocolWithVersion: string,
    private readonly headers: { [header: string]: string | string[] | undefined }) {
      this.urlbuilder = URLBuilder.parse(this.url);
    }

  public getMethod(): HttpMethod {
    return this.method;
  }

  public getUrl(): string {
    return this.url;
  }

  public getEndpoint(): string {
    const urlbuilder = URLBuilder.parse(this.url);
    return `${urlbuilder.getScheme()}://${urlbuilder.getHost()}`;
  }

  public getPath(): string {
    const path = this.urlbuilder.getPath();
    if (path) return path;
    return "";
  }

  public getBodyStream(): NodeJS.ReadableStream {
    return Readable.from([]);
  }

  public getBody(): string | undefined {
    return undefined;
  }

  public setBody(body: string | undefined): BlobBatchSubRequest {
    return this;
  }

  public getHeader(field: string): string | undefined {
    if (!field) {
      throw new TypeError('field argument is required to getHeader');
    }

    if (typeof field !== 'string') {
      throw new TypeError('name must be a string to getHeader');
    }

    const lc = field.toLowerCase();

    return this.headers[lc] as string | undefined;
  }

  public getHeaders(): { [header: string]: string | string[] | undefined } {
    return this.headers;
  }

  public getRawHeaders(): string[] {
    return [];
  }

  public getQuery(key: string): string | undefined {
    const queryValue = this.urlbuilder.getQueryParameterValue(key);
    return queryValue === undefined ? undefined : queryValue.toString();
  }

  public getProtocol(): string {
    return this.urlbuilder.getScheme()!;
  }

  public setHeader(key: string, value: string | string[] | undefined) {
    this.headers[key.toLowerCase()] = value;
  }
}