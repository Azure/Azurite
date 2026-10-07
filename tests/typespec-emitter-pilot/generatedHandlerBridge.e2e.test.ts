import * as assert from "assert";
import type { AddressInfo } from "net";

import express from "express";

import Context from "../../src/queue/generated/Context";
import ExpressMiddlewareFactory from "../../src/queue/generated/ExpressMiddlewareFactory";
import type ILogger from "../../src/queue/generated/utils/ILogger";
import createGeneratedHandlerBridge from "../../src/queue/typespecPilot/generatedHandlerBridge";
import type {
  Context as GeneratedContext,
  IServiceHandler
} from "../../src/queue/typespecPilot/generated/handlers";
import type {
  MessageIdUpdateParameters,
  MessageIdUpdateResponse,
  MessagesEnqueueParameters,
  MessagesEnqueueResponse,
  MessagesPeekParameters,
  MessagesPeekResponse,
  QueueGetPropertiesParameters,
  QueueGetPropertiesResponse
} from "../../src/queue/typespecPilot/generated/operations";

describe("TypeSpec emitter pilot: generated handler live HTTP bridge @loki", () => {
  const contextPath = "typespec_generated_handler";
  const responseDate = "Wed, 07 Oct 2026 18:26:41 GMT";
  const logger: ILogger = {
    error: () => undefined,
    warn: () => undefined,
    info: () => undefined,
    verbose: () => undefined,
    debug: () => undefined
  };

  let baseUrl: string;
  let closeServer: () => Promise<void>;
  let enqueueParameters: MessagesEnqueueParameters | undefined;
  let enqueueContext: GeneratedContext | undefined;
  let peekParameters: MessagesPeekParameters | undefined;
  let peekContext: GeneratedContext | undefined;
  let updateParameters: MessageIdUpdateParameters | undefined;
  let updateContext: GeneratedContext | undefined;

  const notExercised = async (): Promise<never> => {
    throw new Error("Generated handler method was not expected in this test");
  };

  class TestServiceHandler implements IServiceHandler {
    public service_SetProperties: IServiceHandler["service_SetProperties"] =
      notExercised;
    public service_GetProperties: IServiceHandler["service_GetProperties"] =
      notExercised;
    public service_GetStatistics: IServiceHandler["service_GetStatistics"] =
      notExercised;
    public getUserDelegationKey: IServiceHandler["getUserDelegationKey"] =
      notExercised;
    public service_ListQueuesSegment: IServiceHandler["service_ListQueuesSegment"] =
      notExercised;
    public queue_Create: IServiceHandler["queue_Create"] = notExercised;
    public async queue_GetProperties(
      params: QueueGetPropertiesParameters
    ): Promise<QueueGetPropertiesResponse> {
      return {
        statusCode: 200,
        headers: {
          approximateMessagesCount: 3n,
          version: params.version,
          requestId: "properties-request-id",
          clientRequestId: params.clientRequestId,
          date: responseDate
        }
      };
    }
    public queue_Delete: IServiceHandler["queue_Delete"] = notExercised;
    public queue_SetMetadata: IServiceHandler["queue_SetMetadata"] =
      notExercised;
    public queue_GetAccessPolicy: IServiceHandler["queue_GetAccessPolicy"] =
      notExercised;
    public queue_SetAccessPolicy: IServiceHandler["queue_SetAccessPolicy"] =
      notExercised;
    public messages_Dequeue: IServiceHandler["messages_Dequeue"] = notExercised;
    public messages_Clear: IServiceHandler["messages_Clear"] = notExercised;
    public messageId_Delete: IServiceHandler["messageId_Delete"] = notExercised;

    public async messages_Enqueue(
      params: MessagesEnqueueParameters,
      context: GeneratedContext
    ): Promise<MessagesEnqueueResponse> {
      enqueueParameters = params;
      enqueueContext = context;
      if (params.body.messageText === "reject") {
        return {
          statusCode: 400,
          headers: { errorCode: "InvalidMessageContents" }
        };
      }

      return {
        statusCode: 201,
        headers: {
          version: params.version,
          requestId: "enqueue-request-id",
          clientRequestId: params.clientRequestId,
          date: responseDate
        },
        body: {
          items: [
            {
              messageId: "message-1",
              insertionTime: responseDate,
              expirationTime: "Thu, 08 Oct 2026 18:26:41 GMT",
              popReceipt: "pop-receipt-1",
              timeNextVisible: "Wed, 07 Oct 2026 18:27:41 GMT"
            }
          ]
        }
      };
    }

    public async messages_Peek(
      params: MessagesPeekParameters,
      context: GeneratedContext
    ): Promise<MessagesPeekResponse> {
      peekParameters = params;
      peekContext = context;
      return {
        statusCode: 200,
        headers: {
          version: params.version,
          requestId: "peek-request-id",
          clientRequestId: params.clientRequestId,
          date: responseDate
        },
        body: {
          items: [
            {
              messageId: "message-1",
              insertionTime: responseDate,
              expirationTime: "Thu, 08 Oct 2026 18:26:41 GMT",
              dequeueCount: 3n,
              messageText: "hello <queue>"
            }
          ]
        }
      };
    }

    public async messageId_Update(
      params: MessageIdUpdateParameters,
      context: GeneratedContext
    ): Promise<MessageIdUpdateResponse> {
      updateParameters = params;
      updateContext = context;
      return {
        statusCode: 204,
        headers: {
          popReceipt: "updated-pop-receipt",
          timeNextVisible: "Wed, 07 Oct 2026 18:28:41 GMT",
          version: params.version,
          requestId: "update-request-id",
          clientRequestId: params.clientRequestId,
          date: responseDate
        }
      };
    }
  }

  before(async () => {
    const app = express();
    const middlewareFactory = new ExpressMiddlewareFactory(logger, contextPath);
    const handler = new TestServiceHandler();

    app.use((_req, res, next) => {
      const context = new Context(res.locals, contextPath);
      context.contextID = "generated-handler-context";
      context.startTime = new Date("2026-10-07T18:26:41Z");
      next();
    });
    app.use(middlewareFactory.createDispatchMiddleware());
    app.use(middlewareFactory.createDeserializerMiddleware());
    app.use(createGeneratedHandlerBridge(handler, contextPath));
    app.use(middlewareFactory.createSerializerMiddleware());
    app.use(middlewareFactory.createErrorMiddleware());
    app.use(middlewareFactory.createEndMiddleware());

    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    closeServer = () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) =>
          error === undefined ? resolve() : reject(error)
        );
      });
  });

  after(async () => {
    await closeServer();
  });

  beforeEach(() => {
    enqueueParameters = undefined;
    enqueueContext = undefined;
    peekParameters = undefined;
    peekContext = undefined;
    updateParameters = undefined;
    updateContext = undefined;
  });

  it("deserializes Queue XML, headers, and numeric query values into the generated handler interface and serializes its generated response", async () => {
    const response = await fetch(
      `${baseUrl}/pilot-queue/messages?visibilitytimeout=7&messagettl=60`,
      {
        method: "POST",
        headers: {
          "content-type": "Application/XML; charset=utf-8",
          "x-ms-version": "2025-05-05",
          "x-ms-client-request-id": "enqueue-client-id"
        },
        body: "<QueueMessage><MessageText>hello &lt;queue&gt;</MessageText></QueueMessage>"
      }
    );

    assert.strictEqual(response.status, 201);
    assert.deepStrictEqual(enqueueParameters, {
      contentType: "application/xml",
      version: "2025-05-05",
      clientRequestId: "enqueue-client-id",
      visibilityTimeout: 7,
      messageTimeToLive: 60,
      body: { messageText: "hello <queue>" }
    });
    assert.deepStrictEqual(enqueueContext, {
      contextId: "generated-handler-context"
    });
    assert.strictEqual(response.headers.get("content-type"), "application/xml");
    assert.strictEqual(response.headers.get("x-ms-version"), "2025-05-05");
    assert.strictEqual(
      response.headers.get("x-ms-request-id"),
      "enqueue-request-id"
    );
    assert.strictEqual(
      response.headers.get("x-ms-client-request-id"),
      "enqueue-client-id"
    );
    assert.strictEqual(response.headers.get("date"), responseDate);
    assert.strictEqual(
      await response.text(),
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><QueueMessagesList><QueueMessage><MessageId>message-1</MessageId><InsertionTime>Wed, 07 Oct 2026 18:26:41 GMT</InsertionTime><ExpirationTime>Thu, 08 Oct 2026 18:26:41 GMT</ExpirationTime><PopReceipt>pop-receipt-1</PopReceipt><TimeNextVisible>Wed, 07 Oct 2026 18:27:41 GMT</TimeNextVisible></QueueMessage></QueueMessagesList>'
    );
  });

  for (const value of ["", "not-a-number"]) {
    it(`rejects a ${value ? "non-numeric" : "empty"} numeric query before invoking the generated handler`, async () => {
      const response = await fetch(
        `${baseUrl}/pilot-queue/messages?visibilitytimeout=${value}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/xml",
            "x-ms-version": "2025-05-05"
          },
          body: "<QueueMessage><MessageText>invalid</MessageText></QueueMessage>"
        }
      );

      assert.strictEqual(response.status, 400);
      assert.strictEqual(enqueueParameters, undefined);
    });
  }

  it("serializes bigint response headers as decimal wire values", async () => {
    const response = await fetch(`${baseUrl}/pilot-queue?comp=metadata`, {
      headers: {
        "x-ms-version": "2025-05-05"
      }
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(
      response.headers.get("x-ms-approximate-messages-count"),
      "3"
    );
  });

  for (const [name, body] of [
    [
      "Id",
      "<SignedIdentifiers><SignedIdentifier><AccessPolicy/></SignedIdentifier></SignedIdentifiers>"
    ],
    [
      "AccessPolicy",
      "<SignedIdentifiers><SignedIdentifier><Id>policy</Id></SignedIdentifier></SignedIdentifiers>"
    ]
  ]) {
    it(`rejects access-policy XML missing required ${name}`, async () => {
      const response = await fetch(`${baseUrl}/pilot-queue?comp=acl`, {
        method: "PUT",
        headers: {
          "content-type": "application/xml",
          "x-ms-version": "2025-05-05"
        },
        body
      });

      assert.strictEqual(response.status, 400);
    });
  }

  it("deserializes literal and optional query values without leaking dispatch-only literals into the generated handler and serializes XML wire names", async () => {
    const response = await fetch(
      `${baseUrl}/pilot-queue/messages?peekonly=true&numofmessages=2`,
      {
        headers: {
          "x-ms-version": "2025-05-05",
          "x-ms-client-request-id": "peek-client-id"
        }
      }
    );

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(peekParameters, {
      version: "2025-05-05",
      clientRequestId: "peek-client-id",
      numberOfMessages: 2
    });
    assert.deepStrictEqual(peekContext, {
      contextId: "generated-handler-context"
    });
    assert.strictEqual(response.headers.get("content-type"), "application/xml");
    assert.strictEqual(
      response.headers.get("x-ms-request-id"),
      "peek-request-id"
    );
    assert.strictEqual(
      await response.text(),
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><QueueMessagesList><QueueMessage><MessageId>message-1</MessageId><InsertionTime>Wed, 07 Oct 2026 18:26:41 GMT</InsertionTime><ExpirationTime>Thu, 08 Oct 2026 18:26:41 GMT</ExpirationTime><DequeueCount>3</DequeueCount><MessageText>hello &lt;queue&gt;</MessageText></QueueMessage></QueueMessagesList>'
    );
  });

  it("serializes a generated error/status variant with its declared wire header", async () => {
    const response = await fetch(`${baseUrl}/pilot-queue/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/xml",
        "x-ms-version": "2025-05-05"
      },
      body: "<QueueMessage><MessageText>reject</MessageText></QueueMessage>"
    });

    assert.strictEqual(response.status, 400);
    assert.strictEqual(
      response.headers.get("x-ms-error-code"),
      "InvalidMessageContents"
    );
    assert.strictEqual(await response.text(), "");
  });

  it("extracts and decodes a path parameter into the generated typed handler", async () => {
    const response = await fetch(
      `${baseUrl}/pilot-queue/messages/message%2Fid?popreceipt=pop%2Breceipt&visibilitytimeout=11&timeout=4`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/xml",
          "x-ms-version": "2025-05-05",
          "x-ms-client-request-id": "update-client-id"
        },
        body: "<QueueMessage><MessageText>updated</MessageText></QueueMessage>"
      }
    );

    assert.strictEqual(response.status, 204);
    assert.deepStrictEqual(updateParameters, {
      version: "2025-05-05",
      clientRequestId: "update-client-id",
      contentType: "application/xml",
      messageId: "message/id",
      popReceipt: "pop+receipt",
      visibilityTimeout: 11,
      timeout: 4,
      body: { messageText: "updated" }
    });
    assert.deepStrictEqual(updateContext, {
      contextId: "generated-handler-context"
    });
    assert.strictEqual(
      response.headers.get("x-ms-popreceipt"),
      "updated-pop-receipt"
    );
    assert.strictEqual(
      response.headers.get("x-ms-time-next-visible"),
      "Wed, 07 Oct 2026 18:28:41 GMT"
    );
    assert.strictEqual(
      response.headers.get("x-ms-request-id"),
      "update-request-id"
    );
    assert.strictEqual(await response.text(), "");
  });
});
