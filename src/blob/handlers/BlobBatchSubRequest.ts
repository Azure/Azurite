import { Readable } from "stream";
import IRequest, { HttpMethod } from "../generated/IRequest";

export class BlobBatchSubRequest implements IRequest {
  private readonly urlBuilder: URL;
  private readonly rawPath: string;

  public constructor(
    public readonly content_id: number,
    private readonly url: string,
    private readonly method: HttpMethod,
    public  readonly protocolWithVersion: string,
    private readonly headers: { [header: string]: string | string[] | undefined }) {
      this.urlBuilder = new URL(this.url);
      const pathStart = this.url.indexOf("/", this.url.indexOf("://") + 3);
      const queryStart = this.url.indexOf("?", pathStart);
      this.rawPath = pathStart < 0
        ? "/"
        : this.url.slice(pathStart, queryStart < 0 ? undefined : queryStart);
    }

  public getMethod(): HttpMethod {
    return this.method;
  }

  public getUrl(): string {
    return this.url;
  }

  public getEndpoint(): string {
    return this.urlBuilder.origin;
  }

  public getPath(): string {
    return this.rawPath;
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
    return this.urlBuilder.searchParams.get(key) ?? undefined;
  }

  public getProtocol(): string {
    return this.urlBuilder.protocol.slice(0, -1);
  }

  public setHeader(key: string, value: string | string[] | undefined) {
    this.headers[key.toLowerCase()] = value;
  }
}