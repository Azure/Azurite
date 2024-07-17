import { BaseRequestPolicy, WebResource } from "@azure/storage-blob";

// Replace the Query in URI, from old value to new value. This need run with SAS authentication.
// Create a policy factory with create() method provided
// In TypeScript, following factory class needs to implement Azure.RequestPolicyFactory type
export default class QueryRequestPolicyFactory {
  // Constructor to accept parameters
  private oldValue: string;
  private newValue: string;

  constructor(oldValue: string, newValue: string) {
    this.oldValue = oldValue;
    this.newValue = newValue;
  }

  // create() method needs to create a new RequestIDPolicy object
  create(nextPolicy: any, options: any) {
    return new QueryRequestPolicy(
      nextPolicy,
      options,
      this.oldValue,
      this.newValue
    );
  }
}

// Create a policy by extending from Azure.BaseRequestPolicy
class QueryRequestPolicy extends BaseRequestPolicy {
  private oldValue: string;
  private newValue: string;

  constructor(
    nextPolicy: any,
    options: any,
    oldValue: string,
    newValue: string
  ) {
    super(nextPolicy, options);
    this.oldValue = oldValue;
    this.newValue = newValue;
  }

  // Customize HTTP requests and responses by overriding sendRequest
  // Parameter request is Azure.WebResource type
  async sendRequest(request: WebResource) {
    request.url = request.url.replace(this.oldValue, this.newValue);

    const response = await this._nextPolicy.sendRequest(request);

    return response;
  }
}