import { BaseRequestPolicy, WebResource } from "@azure/storage-queue";

// Create a policy factory with create() method provided
// In TypeScript, following factory class needs to implement Azure.RequestPolicyFactory type
export default class OriginPolicyFactory {
  // Constructor to accept parameters
  private origin: string;
  constructor(origin: any) {
    this.origin = origin;
  }

  // create() method needs to create a new RequestIDPolicy object
  create(nextPolicy: any, options: any) {
    return new OriginPolicy(nextPolicy, options, this.origin);
  }
}

// Create a policy by extending from Azure.BaseRequestPolicy
class OriginPolicy extends BaseRequestPolicy {
  private origin: string;
  constructor(nextPolicy: any, options: any, origin: any) {
    super(nextPolicy, options);
    this.origin = origin;
  }

  // Customize HTTP requests and responses by overriding sendRequest
  // Parameter request is Azure.WebResource type
  async sendRequest(request: WebResource) {
    request.headers.set("Origin", `${this.origin}`);

    const response = await this._nextPolicy.sendRequest(request);

    return response;
  }
}
