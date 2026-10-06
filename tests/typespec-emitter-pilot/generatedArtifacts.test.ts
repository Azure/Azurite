import * as assert from "assert";

import {
  operations,
  type OperationMetadata
} from "../../src/queue/typespecPilot/generated/operations";
import {
  deserializeRequest,
  hasGeneratedSerialization,
  serializeResponse
} from "../../src/queue/typespecPilot/generated/serialization";
import type { IServiceHandler } from "../../src/queue/typespecPilot/generated/handlers";

describe("TypeSpec emitter pilot generated artifacts (real Storage Queue spec) @loki", () => {
  function findOperation(name: string): OperationMetadata {
    const op = operations.find((candidate) => candidate.name === name);
    assert.ok(op, `expected a generated operation named "${name}"`);
    return op!;
  }

  it("generates exactly the 17 real Queue operations, zero skipped", () => {
    assert.strictEqual(operations.length, 17);
  });

  it("generates route metadata with the method + path a dispatcher needs", () => {
    const create = findOperation("Queue_Create");
    assert.strictEqual(create.verb, "put");
    assert.strictEqual(create.path, "/");
    assert.deepStrictEqual(create.literalQueryParameters, []);

    const sendMessage = findOperation("Messages_Enqueue");
    assert.strictEqual(sendMessage.verb, "post");
    assert.strictEqual(sendMessage.path, "/messages");
  });

  it("generates literal query constraints for same-path operation disambiguation", () => {
    assert.deepStrictEqual(
      findOperation("Service_SetProperties").literalQueryParameters,
      [
        { name: "restype", value: "service" },
        { name: "comp", value: "properties" }
      ]
    );
    assert.deepStrictEqual(
      findOperation("Messages_Peek").literalQueryParameters,
      [{ name: "peekonly", value: "true" }]
    );
  });

  it("marks the GET operation's query parameters with name/location/required, as dispatch.middleware.ts needs", () => {
    const receiveMessages = findOperation("Messages_Dequeue");

    const numberOfMessages = receiveMessages.parameters.find(
      (p) => p.name === "numberOfMessages"
    );
    assert.ok(numberOfMessages, "expected a numberOfMessages query parameter");
    assert.strictEqual(numberOfMessages!.location, "query");
    assert.strictEqual(numberOfMessages!.wireName, "numofmessages");
    assert.strictEqual(
      numberOfMessages!.required,
      false,
      "optional query parameters must not be marked required, or a dispatcher would wrongly reject requests omitting them"
    );

    const messageId = findOperation("MessageId_Update").parameters.find(
      (p) => p.name === "messageId"
    );
    assert.ok(messageId, "expected a messageId path parameter");
    assert.strictEqual(messageId!.location, "path");
    assert.strictEqual(
      messageId!.required,
      true,
      "path parameters are always required for a dispatcher to match a URL template"
    );

    assert.deepStrictEqual(
      findOperation("MessageId_Update").requiredQueryParameters,
      ["popreceipt", "visibilitytimeout"]
    );
  });

  it("captures the custom response header's name/wire name mapping in per-status response metadata", () => {
    const queueGetProperties = findOperation("Queue_GetProperties");
    const okResponse = queueGetProperties.responses.find(
      (r) => r.statusCode === 200
    )!;
    assert.deepStrictEqual(
      okResponse.headers.find((h) => h.name === "approximateMessagesCount"),
      {
        name: "approximateMessagesCount",
        wireName: "x-ms-approximate-messages-count"
      }
    );
  });

  it("captures the POST operation's XML request body content type (the real spec's declared wire format)", () => {
    const sendMessage = findOperation("Messages_Enqueue");
    assert.strictEqual(sendMessage.hasRequestBody, true);
    assert.deepStrictEqual(sendMessage.requestBodyContentTypes, [
      "application/xml"
    ]);
  });

  it("generates serializer/deserializer functions for the no-body Queue slice used by middleware", async () => {
    assert.ok(hasGeneratedSerialization("Queue_Create"));
    assert.ok(hasGeneratedSerialization("Queue_SetMetadata"));
    assert.ok(hasGeneratedSerialization("Messages_Clear"));
    assert.ok(hasGeneratedSerialization("MessageId_Delete"));
    assert.strictEqual(
      hasGeneratedSerialization("Messages_Enqueue"),
      false,
      "request-body XML operations should continue to use the existing serializer until body serialization is added"
    );

    const req = {
      getQuery: (name: string) => (name === "timeout" ? "5" : undefined),
      getHeader: (name: string) =>
        name.toLowerCase() === "x-ms-version"
          ? "2025-05-05"
          : name.toLowerCase() === "x-ms-client-request-id"
            ? "client-request-id"
            : undefined,
      getHeaders: () => ({ "x-ms-meta-color": "blue" })
    };
    const parameters = await deserializeRequest("Queue_Create", req as any);
    assert.deepStrictEqual(parameters, {
      options: {
        metadata: { color: "blue" },
        requestId: "client-request-id",
        timeout: 5
      },
      version: "2025-05-05"
    });

    const headers: Record<string, unknown> = {};
    const res = {
      setStatusCode: (statusCode: number) => {
        headers.statusCode = statusCode;
        return res;
      },
      setHeader: (name: string, value: unknown) => {
        headers[name] = value;
        return res;
      }
    };
    assert.strictEqual(
      serializeResponse("Queue_Create", res as any, {
        statusCode: 201,
        version: "2025-05-05",
        requestId: "request-id",
        clientRequestId: "client-request-id",
        date: new Date("2026-01-02T03:04:05Z")
      }),
      true
    );
    assert.deepStrictEqual(headers, {
      statusCode: 201,
      "x-ms-version": "2025-05-05",
      "x-ms-request-id": "request-id",
      "x-ms-client-request-id": "client-request-id",
      Date: "Fri, 02 Jan 2026 03:04:05 GMT"
    });
  });

  it("applies azurite.tsp AccessPolicy optionality changes to generated models", () => {
    const modelsSource = require("fs").readFileSync(
      require.resolve("../../src/queue/typespecPilot/generated/models"),
      "utf8"
    ) as string;
    assert.ok(
      modelsSource.includes("start?: string;") &&
        modelsSource.includes("expiry?: string;") &&
        modelsSource.includes("permission?: string;"),
      "expected azurite.tsp @@makeOptional changes to be reflected in AccessPolicy"
    );
  });

  it("generates a handler interface whose method shape matches IQueueHandler's (params, context) => Promise<Response> convention", () => {
    // Type-only check: this doesn't execute, but `tsc`/`ts-node` will fail to compile the test
    // file (and therefore fail this test run) if IServiceHandler's method signatures don't
    // accept a trailing context argument and return a Promise, matching
    // src/queue/generated/handlers/IQueueHandler.ts's real calling convention.
    const assertHandlerShape = (handler: IServiceHandler) => {
      const createResult: Promise<unknown> = handler.queue_Create(
        { version: "2025-05-05" },
        { contextId: "ctx" }
      );
      const sendMessageResult: Promise<unknown> = handler.messages_Enqueue(
        {
          contentType: "application/xml",
          version: "2025-05-05",
          body: { messageText: "hi" }
        },
        { contextId: "ctx" }
      );
      return [createResult, sendMessageResult];
    };
    assert.strictEqual(typeof assertHandlerShape, "function");
  });

  it("reflects the real spec shape: queueName is client-scoped, not an operation parameter", () => {
    const create = findOperation("Queue_Create");
    assert.strictEqual(
      create.parameters.some((p) => p.name === "queueName"),
      false,
      "expected no queueName parameter in the generated metadata for a queue-scoped operation"
    );
  });

  it("captures interfaceName for generated operation provenance", () => {
    assert.strictEqual(
      findOperation("Service_GetProperties").interfaceName,
      "Service"
    );
    assert.strictEqual(
      findOperation("Service_ListQueuesSegment").interfaceName,
      "Service"
    );
    assert.strictEqual(findOperation("Queue_Create").interfaceName, "Queue");
    assert.strictEqual(
      findOperation("Messages_Enqueue").interfaceName,
      "Queue"
    );
    assert.strictEqual(
      findOperation("MessageId_Update").interfaceName,
      "Queue"
    );
  });

  it("generates GetUserDelegationKey metadata even though the handwritten bridge leaves it unrouted", () => {
    const getUserDelegationKey = findOperation("GetUserDelegationKey");
    assert.strictEqual(getUserDelegationKey.verb, "post");
    assert.deepStrictEqual(getUserDelegationKey.literalQueryParameters, [
      { name: "restype", value: "service" },
      { name: "comp", value: "userdelegationkey" }
    ]);
  });
});
