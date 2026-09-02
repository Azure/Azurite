import { BaseRequestPolicy, WebResource } from "@azure/storage-blob";

// Create a policy factory with create() method provided
// In TypeScript, following factory class needs to implement Azure.RequestPolicyFactory type
export default class CustomHeaderPolicyFactory {
  // Constructor to accept parameters
  private key: string;
  private value: string;

  constructor(key: string, value: string) {
    this.key = key;
    this.value = value;
  }

  create(nextPolicy: any, options: any) {
    return new CustomHeaderPolicy(nextPolicy, options, this.key, this.value);
  }
}

// Create a policy by extending from Azure.BaseRequestPolicy
class CustomHeaderPolicy extends BaseRequestPolicy {
  private key: string;
  private value: string;

  constructor(nextPolicy: any, options: any, key: string, value: string) {
    super(nextPolicy, options);
    this.key = key;
    this.value = value;
  }

  // Customize HTTP requests and responses by overriding sendRequest
  // Parameter request is Azure.WebResource type
  async sendRequest(request: WebResource) {
    request.headers.set(this.key, this.value);

    return await this._nextPolicy.sendRequest(request);
  }
}
