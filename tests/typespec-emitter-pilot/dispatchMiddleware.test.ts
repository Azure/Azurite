import * as assert from "assert";

import Operation from "../../src/queue/generated/artifacts/operation";
import Context from "../../src/queue/generated/Context";
import dispatchMiddleware from "../../src/queue/generated/middleware/dispatch.middleware";
import type IRequest from "../../src/queue/generated/IRequest";
import type { HttpMethod } from "../../src/queue/generated/IRequest";
import type ILogger from "../../src/queue/generated/utils/ILogger";

/**
 * Focused, HTTP-free unit coverage of the patched `src/queue/generated/middleware/
 * dispatch.middleware.ts` - proving the dispatch *decision* itself is correct (including
 * disambiguating operations that share a bucket+verb) without depending on auth, persistence,
 * or (de)serialization, which the e2e suite (`pilotServer.e2e.test.ts`) already covers through
 * a real `@azure/storage-queue` SDK client.
 */
describe("patched dispatch.middleware.ts (generated-metadata-driven) @loki", () => {
  function fakeRequest(opts: {
    method: HttpMethod;
    query?: Record<string, string>;
    headers?: Record<string, string>;
  }): IRequest {
    const query = opts.query ?? {};
    const headers: Record<string, string> = {
      "x-ms-version": "2025-05-05",
      ...(opts.headers ?? {})
    };
    return {
      getMethod: () => opts.method,
      getUrl: () => "",
      getEndpoint: () => "",
      getPath: () => "",
      getBodyStream: () => undefined as any,
      setBody: () => undefined as any,
      getBody: () => undefined,
      getHeader: (field: string) => headers[field],
      getHeaders: () => headers,
      getRawHeaders: () => [],
      getQuery: (key: string) => query[key],
      getProtocol: () => "http"
    };
  }

  const silentLogger: ILogger = {
    error: () => undefined,
    warn: () => undefined,
    info: () => undefined,
    verbose: () => undefined,
    debug: () => undefined
  } as unknown as ILogger;

  function dispatch(
    req: IRequest,
    dispatchPattern: string
  ): { operation?: Operation; error?: Error } {
    const context = { dispatchPattern } as unknown as Context;
    let error: Error | undefined;
    dispatchMiddleware(
      context,
      req,
      (err?: Error) => {
        error = err;
      },
      silentLogger
    );
    return { operation: context.operation, error };
  }

  it("picks the more specific operation (SetMetadata) over a less specific same-bucket/verb one (Create) when a distinguishing literal query is present", () => {
    const req = fakeRequest({ method: "PUT", query: { comp: "metadata" } });
    const { operation } = dispatch(req, "/queue");
    assert.strictEqual(operation, Operation.Queue_SetMetadata);
  });

  it("falls back to Create (no distinguishing literal query) when no disambiguating query is present", () => {
    const req = fakeRequest({ method: "PUT" });
    const { operation } = dispatch(req, "/queue");
    assert.strictEqual(operation, Operation.Queue_Create);
  });

  it("disambiguates PeekMessages (?peekonly=true) from ReceiveMessages, both GET /queue/messages", () => {
    const peek = dispatch(
      fakeRequest({ method: "GET", query: { peekonly: "true" } }),
      "/queue/messages"
    );
    assert.strictEqual(peek.operation, Operation.Messages_Peek);

    const receive = dispatch(fakeRequest({ method: "GET" }), "/queue/messages");
    assert.strictEqual(receive.operation, Operation.Messages_Dequeue);
  });

  it('disambiguates account-level GetQueues (?comp=list) from GetProperties (?restype=service&comp=properties), both GET "/"', () => {
    const list = dispatch(
      fakeRequest({ method: "GET", query: { comp: "list" } }),
      "/"
    );
    assert.strictEqual(list.operation, Operation.Service_ListQueuesSegment);

    const props = dispatch(
      fakeRequest({
        method: "GET",
        query: { restype: "service", comp: "properties" }
      }),
      "/"
    );
    assert.strictEqual(props.operation, Operation.Service_GetProperties);
  });

  it("preserves legacy HEAD operations that are not present in the real Queue TypeSpec", () => {
    const properties = dispatch(fakeRequest({ method: "HEAD" }), "/queue");
    assert.strictEqual(
      properties.operation,
      Operation.Queue_GetPropertiesWithHead
    );

    const accessPolicy = dispatch(
      fakeRequest({ method: "HEAD", query: { comp: "acl" } }),
      "/queue"
    );
    assert.strictEqual(
      accessPolicy.operation,
      Operation.Queue_GetAccessPolicyWithHead
    );
  });

  it("rejects a request matching no generated operation with UnsupportedRequestError, leaving context.operation undefined", () => {
    const req = fakeRequest({
      method: "GET",
      query: { comp: "not-a-real-comp-value" }
    });
    const { operation, error } = dispatch(req, "/queue");
    assert.strictEqual(operation, undefined);
    assert.ok(
      error,
      "expected dispatchMiddleware to call next(error) for an unroutable request"
    );
  });

  it("never routes to GetUserDelegationKey: Azurite has no real Operation enum member or handler for it (documented gap)", () => {
    // Confirmed against src/queue/generated/artifacts/operation.ts (no
    // `Service_GetUserDelegationKey` member) and src/queue/handlers/ServiceHandler.ts (no
    // getUserDelegationKey method) as of this writing.
    const req = fakeRequest({
      method: "POST",
      query: { restype: "service", comp: "userdelegationkey" }
    });
    const { operation, error } = dispatch(req, "/");
    assert.strictEqual(operation, undefined);
    assert.ok(
      error,
      "expected GetUserDelegationKey requests to be rejected, not routed"
    );
  });
});
