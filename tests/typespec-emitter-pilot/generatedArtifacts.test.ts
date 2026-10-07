import * as assert from "assert";
import { readFileSync } from "fs";
import { Readable } from "stream";

import {
  operations,
  type OperationMetadata
} from "../../src/queue/typespecPilot/generated/metadata";
import type { QueueCreateParameters } from "../../src/queue/typespecPilot/generated/operations";
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
        wireName: "x-ms-approximate-messages-count",
        type: { kind: "number" }
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

  it("generates serializer/deserializer functions for Queue operations used by middleware", async () => {
    assert.ok(hasGeneratedSerialization("Queue_Create"));
    assert.ok(hasGeneratedSerialization("Queue_SetMetadata"));
    assert.ok(hasGeneratedSerialization("Messages_Clear"));
    assert.ok(hasGeneratedSerialization("MessageId_Delete"));
    assert.strictEqual(
      hasGeneratedSerialization("Messages_Enqueue"),
      true,
      "request-body XML operations should be handled by the generated TypeSpec serializer"
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
    const parameters = await deserializeRequest(
      "Queue_Create",
      req as any,
      {} as any
    );
    assert.deepStrictEqual(parameters, {
      version: "2025-05-05",
      clientRequestId: "client-request-id",
      timeout: 5,
      metadata: { color: "blue" }
    });
    const typedParameters: QueueCreateParameters =
      parameters as QueueCreateParameters;
    assert.deepStrictEqual(typedParameters.metadata, { color: "blue" });

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
        headers: {
          version: "2025-05-05",
          requestId: "request-id",
          clientRequestId: "client-request-id",
          date: new Date("2026-01-02T03:04:05Z")
        }
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

    let capturedBody: string | undefined;
    const enqueueParameters = await deserializeRequest(
      "Messages_Enqueue",
      {
        getQuery: (name: string) =>
          name === "visibilitytimeout" ? "5" : undefined,
        getHeader: (name: string) =>
          name.toLowerCase() === "content-type"
            ? "application/xml"
            : name.toLowerCase() === "x-ms-version"
              ? "2025-05-05"
              : undefined,
        getHeaders: () => ({}),
        getBodyStream: () =>
          Readable.from([
            "<QueueMessage><MessageText>hello</MessageText></QueueMessage>"
          ]),
        setBody: (body: string | undefined) => {
          capturedBody = body;
          return undefined;
        },
        getBody: () => capturedBody
      } as any,
      {} as any
    );
    assert.deepStrictEqual(enqueueParameters, {
      contentType: "application/xml",
      version: "2025-05-05",
      visibilityTimeout: 5,
      body: { messageText: "hello" }
    });
    assert.strictEqual(
      capturedBody,
      "<QueueMessage><MessageText>hello</MessageText></QueueMessage>"
    );
  });

  it("applies azurite.tsp AccessPolicy optionality changes to generated models", () => {
    const modelsSource = readFileSync(
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

  it("keeps generic protocol helpers in the handwritten runtime, not generated output", () => {
    const generatedModules = [
      "handlers",
      "metadata",
      "models",
      "operations",
      "serialization"
    ];
    const generatedSources = generatedModules.map((module) =>
      readFileSync(
        require.resolve(`../../src/queue/typespecPilot/generated/${module}`),
        "utf8"
      )
    );
    const metadataSource = generatedSources[1];
    const operationsSource = generatedSources[3];
    const serializationSource = generatedSources[4];
    const lineCount = (source: string) => source.split("\n").length - 1;
    assert.ok(
      lineCount(serializationSource) < 50,
      "generated serialization must remain a thin service binding"
    );
    assert.ok(
      generatedSources.reduce((total, source) => total + lineCount(source), 0) <
        2000,
      "total generated output must remain below the compact-output budget"
    );
    assert.strictEqual(
      metadataSource.match(/defineServiceMetadata\(\{/g)?.length,
      1,
      "metadata must define the consolidated service graph exactly once"
    );
    assert.strictEqual(operationsSource.includes("defineOperations"), false);
    assert.strictEqual(
      operationsSource.includes('"Service_SetProperties"'),
      false,
      "operation declarations must not contain runtime mapping literals"
    );
    assert.strictEqual(
      serializationSource.includes('"Service_SetProperties"'),
      false,
      "serialization binding must not duplicate runtime mapping literals"
    );
    assert.ok(serializationSource.includes("createSerializationRuntime"));
    for (const helper of [
      "deserializeMetadataRequest",
      "deserializeRequestBody",
      "serializeMetadataResponse",
      "serializeResponseBody",
      "deserializeXmlModel",
      "serializeXmlModel",
      "getHeaderCollection",
      "setHeaderCollection"
    ]) {
      assert.strictEqual(
        serializationSource.includes(helper),
        false,
        `generated serialization must not contain generic helper ${helper}`
      );
    }
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
