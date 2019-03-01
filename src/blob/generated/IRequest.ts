export type HttpMethod =
  | "GET"
  | "HEAD"
  | "POST"
  | "PUT"
  | "DELETE"
  | "CONNECT"
  | "OPTIONS"
  | "TRACE"
  | "PATCH";

export default interface IRequest {
  getMethod(): HttpMethod;
  getUrl(): string;
  getPath(): string;
  getBodyStream(): NodeJS.ReadableStream;
  setBody(body: string | undefined): IRequest;
  getBody(): string | undefined;
  getHeader(field: string): string | undefined;
  getHeaders(): {[header: string]: string | string[] | undefined};
  getQuery(key: string): string | undefined;
}
