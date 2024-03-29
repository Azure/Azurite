import { OutgoingHttpHeaders } from 'http';

export default interface IResponse {
  setStatusCode(code: number): IResponse;
  getStatusCode(): number;
  setStatusMessage(message: string): IResponse;
  getStatusMessage(): string;
  setHeader(
    field: string,
    value?: string | string[] | undefined | number | boolean
  ): IResponse;
  getHeader(field: string): number | string | string[] | undefined;
  getHeaders(): OutgoingHttpHeaders;
  headersSent(): boolean;
  setContentType(value: string | undefined): IResponse;
  getBodyStream(): NodeJS.WritableStream;
}
