import { strict as assert } from "assert";
import { Readable } from "stream";

import * as msRest from "@azure/ms-rest-js";

import BlobContext from "../../src/blob/generated/Context";
import BlobIRequest from "../../src/blob/generated/IRequest";
import BlobILogger from "../../src/blob/generated/utils/ILogger";
import { deserialize as deserializeBlob } from "../../src/blob/generated/utils/serializer";
import QueueContext from "../../src/queue/generated/Context";
import QueueIRequest from "../../src/queue/generated/IRequest";
import QueueILogger from "../../src/queue/generated/utils/ILogger";
import { deserialize as deserializeQueue } from "../../src/queue/generated/utils/serializer";
import TableContext from "../../src/table/generated/Context";
import TableIRequest from "../../src/table/generated/IRequest";
import TableILogger from "../../src/table/generated/utils/ILogger";
import { deserialize as deserializeTable } from "../../src/table/generated/utils/serializer";

const requestBodyMapper: msRest.Mapper = {
  serializedName: "body",
  type: {
    name: "String"
  }
};

const spec = {
  httpMethod: "POST",
  path: "/",
  urlParameters: [],
  requestBody: {
    parameterPath: "bodyParameter",
    mapper: requestBodyMapper
  },
  responses: {},
  serializer: new msRest.Serializer()
} as msRest.OperationSpec;

const logger: BlobILogger & QueueILogger & TableILogger = {
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  verbose: () => undefined,
  debug: () => undefined
};

type DeserializeCase = {
  name: string;
  deserialize: (
    context: any,
    req: BlobIRequest & QueueIRequest & TableIRequest,
    operationSpec: msRest.OperationSpec,
    operationLogger: BlobILogger & QueueILogger & TableILogger
  ) => Promise<unknown>;
  createContext: () => BlobContext | QueueContext | TableContext;
};

describe("Generated serializer readRequestIntoText @loki", () => {
  const cases: DeserializeCase[] = [
    {
      name: "Blob",
      deserialize: deserializeBlob,
      createContext: () =>
        new BlobContext({ generated: { contextID: "blob" } }, "generated")
    },
    {
      name: "Queue",
      deserialize: deserializeQueue,
      createContext: () =>
        new QueueContext({ generated: { contextID: "queue" } }, "generated")
    },
    {
      name: "Table",
      deserialize: deserializeTable,
      createContext: () =>
        new TableContext({ generated: { contextID: "table" } }, "generated")
    }
  ];

  for (const testCase of cases) {
    it(`${testCase.name} preserves multi-byte UTF-8 characters split across chunks`, async () => {
      const expectedBodyParameter = "before 🌊 after";
      const request = createRequestWithSplitMultiByteCharacter(
        JSON.stringify(expectedBodyParameter),
        "🌊"
      );

      const parameters = (await testCase.deserialize(
        testCase.createContext(),
        request,
        spec,
        logger
      )) as { bodyParameter: string; body: string };

      assert.equal(parameters.bodyParameter, expectedBodyParameter);
      assert.equal(parameters.body, JSON.stringify(expectedBodyParameter));
    });
  }
});

function createRequestWithSplitMultiByteCharacter(
  body: string,
  splitCharacter: string
): BlobIRequest & QueueIRequest & TableIRequest {
  const bodyBuffer = Buffer.from(body, "utf8");
  const splitCharacterBuffer = Buffer.from(splitCharacter, "utf8");
  assert.ok(splitCharacterBuffer.length > 1);
  const splitCharacterIndex = bodyBuffer.indexOf(splitCharacterBuffer);
  assert.notEqual(splitCharacterIndex, -1);
  const splitIndex =
    splitCharacterIndex + Math.floor(splitCharacterBuffer.length / 2);
  let storedBody: string | undefined;

  const request = {
    getMethod: () => "POST",
    getUrl: () => "/",
    getEndpoint: () => "/",
    getPath: () => "/",
    getBodyStream: () =>
      Readable.from([
        bodyBuffer.subarray(0, splitIndex),
        bodyBuffer.subarray(splitIndex)
      ]),
    setBody: (newBody: string | undefined) => {
      storedBody = newBody;
      return request;
    },
    getBody: () => storedBody,
    getHeader: (field: string) =>
      field.toLowerCase() === "content-type" ? "application/json" : undefined,
    getHeaders: () => ({ "content-type": "application/json" }),
    getRawHeaders: () => [],
    getQuery: () => undefined,
    getProtocol: () => "http"
  } as BlobIRequest & QueueIRequest & TableIRequest;

  return request;
}
