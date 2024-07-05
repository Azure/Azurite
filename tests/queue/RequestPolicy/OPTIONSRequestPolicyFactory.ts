import { BaseRequestPolicy, WebResource } from "@azure/storage-queue";

// Create a policy factory with create() method provided
// In TypeScript, following factory class needs to implement Azure.RequestPolicyFactory type
export default class OPTIONSRequestPolicyFactory {
  // Constructor to accept parameters
  private origin: string | undefined;
  private requestMethod: string | undefined;
  private requestHeaders: string | undefined;

  constructor(origin?: string, requestMethod?: string, requestHeaders?: string) {
    this.origin = origin;
    this.requestMethod = requestMethod;
    this.requestHeaders = requestHeaders;
  }

  // create() method needs to create a new RequestIDPolicy object
  create(nextPolicy: any, options: any) {
    return new OPTIONSRequestPolicy(
      nextPolicy,
      options,
      this.origin,
      this.requestMethod,
      this.requestHeaders
    );
  }
}

// Create a policy by extending from Azure.BaseRequestPolicy
// tslint:disable-next-line: max-classes-per-file
class OPTIONSRequestPolicy extends BaseRequestPolicy {
  private origin: string | undefined;
  private requestMethod: string | undefined;
  private requestHeaders: string | undefined;
  constructor(
    nextPolicy: any,
    options: any,
    origin?: string,
    requestMethod?: string,
    requestHeaders?: string
  ) {
    super(nextPolicy, options);
    this.origin = origin;
    this.requestMethod = requestMethod;
    this.requestHeaders = requestHeaders;
  }

  // Customize HTTP requests and responses by overriding sendRequest
  // Parameter request is Azure.WebResource type
  async sendRequest(request: WebResource) {
    request.method = "OPTIONS";
    request.headers.set("Origin", `${this.origin}`);
    if (this.origin !== undefined) {
      request.headers.set("Origin", `${this.origin}`);
    }
    if (this.requestMethod !== undefined) {
      request.headers.set(
        "Access-Control-Request-Method",
        `${this.requestMethod}`
      );
    }
    if (this.requestHeaders !== undefined) {
      request.headers.set(
        "Access-Control-Request-Headers",
        `${this.requestHeaders}`
      );
    }

    const response = await this._nextPolicy.sendRequest(request);

    return response;
  }
}
