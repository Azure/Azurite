import * as assert from "assert";

import {
  operations,
  type OperationMetadata
} from "../../src/queue/typespecPilot/generated/operations";
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
    const create = findOperation("Create");
    assert.strictEqual(create.verb, "put");
    assert.strictEqual(create.path, "/");
    assert.deepStrictEqual(create.literalQueryParameters, []);
    assert.strictEqual(create.dispatchPattern, "/queue");
    assert.strictEqual(create.operationEnumName, "Queue_Create");

    const sendMessage = findOperation("SendMessage");
    assert.strictEqual(sendMessage.verb, "post");
    assert.strictEqual(sendMessage.path, "/messages");
    assert.strictEqual(sendMessage.dispatchPattern, "/queue/messages");
    assert.strictEqual(sendMessage.operationEnumName, "Messages_Enqueue");
  });

  it("generates literal query constraints for same-path operation disambiguation", () => {
    assert.deepStrictEqual(findOperation("SetProperties").literalQueryParameters, [
      { name: "restype", value: "service" },
      { name: "comp", value: "properties" }
    ]);
    assert.deepStrictEqual(findOperation("PeekMessages").literalQueryParameters, [
      { name: "peekonly", value: "true" }
    ]);
  });

  it("marks the GET operation's query parameters with name/location/required, as dispatch.middleware.ts needs", () => {
    const receiveMessages = findOperation("ReceiveMessages");

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

    const messageId = findOperation("UpdateMessage").parameters.find(
      (p) => p.name === "messageId"
    );
    assert.ok(messageId, "expected a messageId path parameter");
    assert.strictEqual(messageId!.location, "path");
    assert.strictEqual(
      messageId!.required,
      true,
      "path parameters are always required for a dispatcher to match a URL template"
    );

    assert.deepStrictEqual(findOperation("UpdateMessage").requiredQueryParameters, [
      "popreceipt",
      "visibilitytimeout"
    ]);
  });

  it("captures the custom response header's name/wire name mapping in per-status response metadata", () => {
    const queueGetProperties = findOperation("QueueGetProperties");
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
    const sendMessage = findOperation("SendMessage");
    assert.strictEqual(sendMessage.hasRequestBody, true);
    assert.deepStrictEqual(sendMessage.requestBodyContentTypes, [
      "application/xml"
    ]);
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
      const createResult: Promise<unknown> = handler.create(
        { version: "2025-05-05" },
        { contextId: "ctx" }
      );
      const sendMessageResult: Promise<unknown> = handler.sendMessage(
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
    const create = findOperation("Create");
    assert.strictEqual(
      create.parameters.some((p) => p.name === "queueName"),
      false,
      "expected no queueName parameter in the generated metadata for a queue-scoped operation"
    );
  });

  it("captures interfaceName for generated operation provenance", () => {
    assert.strictEqual(findOperation("GetProperties").interfaceName, "Service");
    assert.strictEqual(findOperation("GetQueues").interfaceName, "Service");
    assert.strictEqual(findOperation("Create").interfaceName, "Queue");
    assert.strictEqual(findOperation("SendMessage").interfaceName, "Queue");
    assert.strictEqual(findOperation("UpdateMessage").interfaceName, "Queue");
  });

  it("leaves GetUserDelegationKey generated but unrouted because Azurite has no existing enum member", () => {
    const getUserDelegationKey = findOperation("GetUserDelegationKey");
    assert.strictEqual(getUserDelegationKey.dispatchPattern, "/");
    assert.strictEqual(getUserDelegationKey.operationEnumName, undefined);
  });
});
