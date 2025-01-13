import { BaseRequestPolicy, WebResource } from "@azure/storage-blob";

// Create a policy factory with create() method provided
// In TypeScript, following factory class needs to implement Azure.RequestPolicyFactory type
export default class RangePolicyFactory {
  // Constructor to accept parameters
  private range: string;

  constructor(range: any) {
    this.range = range;
  }

  // create() method needs to create a new RequestIDPolicy object
  create(nextPolicy: any, options: any) {
    return new RangePolicy(nextPolicy, options, this.range);
  }
}

// Create a policy by extending from Azure.BaseRequestPolicy
class RangePolicy extends BaseRequestPolicy {
  private range: string;

  constructor(nextPolicy: any, options: any, range: any) {
    super(nextPolicy, options);
    this.range = range;
  }

  // Customize HTTP requests and responses by overriding sendRequest
  // Parameter request is Azure.WebResource type
  async sendRequest(request: WebResource) {
    request.headers.set("Range", `${this.range}`);

    return await this._nextPolicy.sendRequest(request);
  }
}
