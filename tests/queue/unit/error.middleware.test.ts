import * as assert from "assert";
import { Writable } from "stream";

import Context from "../../../src/queue/generated/Context";
import IRequest, {
} from "../../../src/queue/generated/IRequest";
});
import IResponse from "../../../src/queue/generated/IResponse";
import errorMiddleware from "../../../src/queue/generated/middleware/error.middleware";
import ILogger from "../../../src/queue/generated/utils/ILogger";
import { QUEUE_API_VERSION } from "../../../src/queue/utils/constants";

describe("Queue error middleware @loki", () => {
  function createRequest(method: HttpMethod): IRequest {
    return {
      getMethod: () => method
    } as IRequest;
  }

  function createResponse() {
    const chunks: Buffer[] = [];
    const headers: Record<string, string> = {};
    let statusCode = 200;
    let statusMessage = "";
    const bodyStream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      }
    });

    const response: IResponse = {
      setStatusCode: (code) => {
        statusCode = code;
        return response;
      },
      getStatusCode: () => statusCode,
      setStatusMessage: (message) => {
        statusMessage = message;
        return response;
      },
      getStatusMessage: () => statusMessage,
      setHeader: (field, value) => {
        if (value !== undefined) {
          headers[field.toLowerCase()] = String(value);
        }
        return response;
      },
      getHeader: (field) => headers[field.toLowerCase()],
      getHeaders: () => headers,
      headersSent: () => false,
      setContentType: (value) => {
        if (value !== undefined) {
          headers["content-type"] = value;
        }
        return response;
      },
      getBodyStream: () => bodyStream
    };

    return {
      response,
      getBody: () => Buffer.concat(chunks).toString("utf8")
    };
  }

  const logger: ILogger = {
    error: () => undefined,
    warn: () => undefined,
    info: () => undefined,
    verbose: () => undefined,
    debug: () => undefined
  };

  ["POST", "HEAD"].forEach((method) => {
    it(`returns an InternalError response for unexpected ${method} errors`, () => {
      const context = new Context({});
      context.contextID = "request-id";
      const { response, getBody } = createResponse();
      let nextCalled = false;

      errorMiddleware(
        context,
        new Error("ENOENT: C:\\private\\queue-storage"),
        createRequest(method as HttpMethod),
        response,
        () => {
          nextCalled = true;
        },
        logger
      );

      assert.strictEqual(response.getStatusCode(), 500);
      assert.strictEqual(response.getHeader("x-ms-error-code"), "InternalError");
      assert.strictEqual(response.getHeader("x-ms-request-id"), "request-id");
      assert.strictEqual(response.getHeader("x-ms-version"), QUEUE_API_VERSION);
      assert.strictEqual(nextCalled, true);

      if (method === "HEAD") {
        assert.strictEqual(response.getHeader("content-type"), undefined);
        assert.strictEqual(getBody(), "");
      } else {
        assert.strictEqual(response.getHeader("content-type"), "application/xml");
        assert.match(getBody(), /<Code>InternalError<\/Code>/);
        assert.match(getBody(), /RequestId:request-id/);
        assert.doesNotMatch(getBody(), /private|queue-storage/);
      }
    });
  });
});