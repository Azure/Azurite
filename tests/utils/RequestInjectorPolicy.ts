import {
  BaseRequestPolicy,
  HttpHeaders,
  HttpOperationResponse,
  RequestPolicy,
  RequestPolicyFactory,
  RequestPolicyOptions,
  WebResource
} from "@azure/storage-blob";

export function requestInjectorPolicy(
  headers: Record<string, string>,
  injectFunc?: (req: WebResource) => void
): RequestPolicyFactory {
  return {
    create: (nextPolicy: RequestPolicy, options: RequestPolicyOptions) => {
      return new RequestInjectorPolicy(
        nextPolicy,
        options,
        headers,
        injectFunc
      );
    }
  };
}

/**
 *
 * Provides a RequestPolicy that can request a token from a TokenCredential
 * implementation and then apply it to the Authorization header of a request
 * as a Bearer token.
 *
 */
export class RequestInjectorPolicy extends BaseRequestPolicy {
  /**
   * Creates a new RequestHeaderInjectorPolicy object.
   *
   * @param nextPolicy - The next RequestPolicy in the request pipeline.
   * @param options - Options for this RequestPolicy.
   * @param headers - The headers to set in the request.
   */
  constructor(
    nextPolicy: RequestPolicy,
    options: RequestPolicyOptions,
    private headers: Record<string, string>,
    private injectFunc?: (req: WebResource) => void
  ) {
    super(nextPolicy, options);
  }

  /**
   * Applies the Bearer token to the request through the Authorization header.
   */
  public async sendRequest(
    webResource: WebResource
  ): Promise<HttpOperationResponse> {
    if (!webResource.headers) webResource.headers = new HttpHeaders();

    for (const key in this.headers) {
      webResource.headers.set(key, this.headers[key]);
    }

    if (this.injectFunc) {
      this.injectFunc(webResource);
    }

    return this._nextPolicy.sendRequest(webResource);
  }
}
