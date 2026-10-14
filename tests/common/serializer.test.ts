import { OperationSpec, Serializer } from "@azure/ms-rest-js";
import { strict as assert } from "assert";
import { Readable, Writable } from "stream";
import { instance, mock, when } from "ts-mockito";

import BlobContext from "../../src/blob/generated/Context";
import IResponse from "../../src/blob/generated/IResponse";
import ILogger from "../../src/blob/generated/utils/ILogger";
import { serialize as serializeBlob } from "../../src/blob/generated/utils/serializer";
import QueueContext from "../../src/queue/generated/Context";
import { serialize as serializeQueue } from "../../src/queue/generated/utils/serializer";
import TableContext from "../../src/table/generated/Context";
import { serialize as serializeTable } from "../../src/table/generated/utils/serializer";

describe("Stream response serializers @loki", () => {
  const spec: OperationSpec = {
    path: "/",
    httpMethod: "GET",
    responses: {
      200: {
        bodyMapper: {
          serializedName: "body",
          type: { name: "Stream" }
        }
      }
    },
    serializer: new Serializer({})
  };
  const logger: ILogger = instance(mock<ILogger>());
  const serializers: Array<{
    name: string;
    serialize(response: IResponse, body: Readable): Promise<void>;
  }> = [
    {
      name: "Blob",
      serialize: (response, body) =>
        serializeBlob(
          new BlobContext({}, "context"),
          response,
          spec,
          { statusCode: 200, body },
          logger
        )
    },
    {
      name: "Queue",
      serialize: (response, body) =>
        serializeQueue(
          new QueueContext({}, "context"),
          response,
          spec,
          { statusCode: 200, body },
          logger
        )
    },
    {
      name: "Table",
      serialize: (response, body) =>
        serializeTable(
          new TableContext({}, "context"),
          response,
          spec,
          { statusCode: 200, body },
          logger
        )
    }
  ];

  for (const serializer of serializers) {
    it(`${serializer.name} handles a late body construction error after the response has closed @loki`, async function (this: Mocha.Context) {
      this.timeout(2000);

      const responseStream = new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        }
      });
      await new Promise<void>((resolve) => {
        responseStream.once("close", resolve);
        responseStream.destroy();
      });
      assert.strictEqual(responseStream.destroyed, true);

      const responseMock = mock<IResponse>();
      when(responseMock.getBodyStream()).thenReturn(responseStream);
      const response = instance(responseMock);

      const constructionError = new Error("Late body construction failure");
      let destroyedBeforeError = false;
      let errorListenersBeforeError = 0;
      const body = new Readable({
        construct(callback) {
          setImmediate(() => {
            destroyedBeforeError = this.destroyed;
            errorListenersBeforeError = this.listenerCount("error");
            callback(constructionError);
          });
        },
        read() {
          assert.fail("A disconnected response must not read the body");
        }
      });
      assert.strictEqual(body.listenerCount("error"), 0);

      // events.once() would add its own error handler; only production may handle it.
      const bodyClosed = new Promise<void>((resolve) => {
        body.once("close", resolve);
      });

      await serializer.serialize(response, body);
      assert.strictEqual(body.destroyed, true);
      await bodyClosed;

      assert.strictEqual(destroyedBeforeError, true);
      assert.ok(
        errorListenersBeforeError > 0,
        "serialize() must register a body error listener before cancellation"
      );
      assert.strictEqual(body.errored, constructionError);
    });
  }
});
