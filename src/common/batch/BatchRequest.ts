import { exception } from "console";
import { Stream } from "stream";
import IRequest, { HttpMethod } from "../../table/generated/IRequest";
import BatchOperation from "./BatchOperation";
import BatchRequestHeaders from "./BatchRequestHeaders";

// ToDo: Requires validation against all operation types
// currently several funcitons of the interface are not implemented
export default class BatchRequest implements IRequest {
  public response?: any;
  private headers: BatchRequestHeaders;
  private batchOperation: BatchOperation;

  public constructor(batchOperation: BatchOperation) {
    this.batchOperation = batchOperation;
    this.headers = new BatchRequestHeaders(batchOperation.rawHeaders);
  }

  public getMethod(): HttpMethod {
    if (this.batchOperation.httpMethod != null) {
      return this.batchOperation.httpMethod;
    } else {
      throw exception("httpMethod invalid on batch operation");
    }
  }

  public getUrl(): string {
    // ToDo: is this a valid assumption for the batch API?
    // ToDo: here we also assume https, which is also not true...
    // we need to parse this from the request
    // return `https://${this.accountName}.${this.batchOperation.batchType}.core.windows.net/$batch`;
    if (this.batchOperation.uri != null && this.batchOperation.path != null) {
      return this.batchOperation.uri.substring(
        0,
        this.batchOperation.uri.length - this.batchOperation.path.length
      );
    } else {
      throw exception("uri or path null when calling getUrl on BatchRequest");
    }
  }

  public getEndpoint(): string {
    throw new Error("Method not implemented.");
  }

  public getPath(): string {
    if (this.batchOperation.path != null) {
      return this.batchOperation.path;
    } else {
      throw exception("path null  when calling getPath on BatchRequest");
    }
  }

  public getBodyStream(): NodeJS.ReadableStream {
    if (this.batchOperation.jsonRequestBody != null) {
      return Stream.Readable.from(this.batchOperation.jsonRequestBody);
    } else {
      throw exception("body null  when calling getBodyStream on BatchRequest");
    }
  }

  public setBody(body: string | undefined): IRequest {
    throw new Error("Method not implemented.");
  }

  public getBody(): string | undefined {
    if (this.batchOperation.jsonRequestBody != null) {
      return this.batchOperation.jsonRequestBody;
    } else {
      throw exception("body null  when calling getBody on BatchRequest");
    }
  }

  public getHeader(field: string): string | undefined {
    return this.headers.header(field);
  }

  public getHeaders(): { [header: string]: string | string[] | undefined } {
    throw new Error("Method not implemented.");
  }

  public getRawHeaders(): string[] {
    return this.batchOperation.rawHeaders;
  }

  public getQuery(key: string): string | undefined {
    throw new Error("Method not implemented.");
  }

  public getProtocol(): string {
    if (this.batchOperation.protocol != null) {
      return this.batchOperation.protocol;
    } else {
      throw exception(
        "protocol null  when calling getProtocol on BatchRequest"
      );
    }
  }
}
