import { SendRequest, PipelineRequest, PipelineResponse } from "@azure/core-rest-pipeline";


export default class OPTIONSRequestPolicy {
  // Constructor to accept parameters
  private origin: string | undefined;
  private requstMethod: string | undefined;
  private requestHeaders: string | undefined;
  name: string;

  constructor(name: string, origin?: string, requstMethod?: string, requestHeaders?: string) {
    this.name = name;
    this.origin = origin;
    this.requstMethod = requstMethod;
    this.requestHeaders = requestHeaders;
  }

  async sendRequest(request: PipelineRequest, next: SendRequest): Promise<PipelineResponse> {
    request.method = "OPTIONS";
    request.headers.set("Origin", `${this.origin}`);
    if (this.origin !== undefined) {
      request.headers.set("Origin", `${this.origin}`);
    }
    if (this.requstMethod !== undefined) {
      request.headers.set(
        "Access-Control-Request-Method",
        `${this.requstMethod}`
      );
    }
    if (this.requestHeaders !== undefined) {
      request.headers.set(
        "Access-Control-Request-Headers",
        `${this.requestHeaders}`
      );
    }

    const response = await next(request);
    return response;
  }
}