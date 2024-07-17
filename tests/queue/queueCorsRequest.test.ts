import {
  StorageSharedKeyCredential,
  newPipeline,
  QueueServiceClient
} from "@azure/storage-queue";
import * as assert from "assert";

import { configLogger } from "../../src/common/Logger";
import { StoreDestinationArray } from "../../src/common/persistence/IExtentStore";
import Server from "../../src/queue/QueueServer";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  rmRecursive,
  sleep
} from "../testutils";
import OPTIONSRequestPolicyFactory from "./RequestPolicy/OPTIONSRequestPolicyFactory";
import OriginPolicyFactory from "./RequestPolicy/OriginPolicyFactory";
import QueueTestServerFactory from "./utils/QueueTestServerFactory";

// Set true to enable debug log
configLogger(false);

describe("Queue Cors requests test", () => {
  // TODO: Create a server factory as tests utils
  const host = "127.0.0.1";
  const port = 11001;
  const metadataDbPath = "__queueTestsStorage__";
  const extentDbPath = "__extentTestsStorage__";
  const persistencePath = "__queueTestsPersistence__";

  const DEFAULT_QUEUE_PERSISTENCE_ARRAY: StoreDestinationArray = [
    {
      locationId: "queueTest",
      locationPath: persistencePath,
      maxConcurrency: 10
    }
  ];

  const baseURL = `http://${host}:${port}/devstoreaccount1`;
  const serviceClient = new QueueServiceClient(
    baseURL,
    newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 }
      }
    )
  );

  let server: Server;
  before(async () => {
    server = new QueueTestServerFactory().createServer({
      metadataDBPath: metadataDbPath,
      extentDBPath: metadataDbPath,
      persistencePathArray: DEFAULT_QUEUE_PERSISTENCE_ARRAY
    });
    await server.start();
  });

  after(async () => {
    await server.close();
    await rmRecursive(metadataDbPath);
    await rmRecursive(extentDbPath);
    await rmRecursive(persistencePath);
  });

  it("OPTIONS request without cors rules in server should be fail @loki", async () => {
    const serviceProperties = await serviceClient.getProperties();
    serviceProperties.cors = [];
    await serviceClient.setProperties(serviceProperties);

    const origin = "Origin";
    const requestMethod = "GET";

    const pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, requestMethod)
    );
    const serviceClientForOPTIONS = new QueueServiceClient(baseURL, pipeline);

    let error;
    try {
      await serviceClientForOPTIONS.getProperties();
    } catch (err) {
      error = err;
    }

    assert.ok(error.statusCode === 403);
    assert.ok(
      error.message.includes(
        "CORS not enabled or no matching rule found for this request."
      )
    );
  });

  it("OPTIONS request should not work without matching cors rules @loki", async () => {
    const serviceProperties = await serviceClient.getProperties();

    const newCORS = {
      allowedHeaders: "header",
      allowedMethods: "GET",
      allowedOrigins: "test",
      exposedHeaders: "*",
      maxAgeInSeconds: 8888
    };

    serviceProperties.cors = [newCORS];

    await serviceClient.setProperties(serviceProperties);

    await sleep(100);

    let origin = "Origin";
    let requestMethod = "GET";

    let pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, requestMethod)
    );
    let serviceClientForOPTIONS = new QueueServiceClient(baseURL, pipeline);

    let error;
    try {
      await serviceClientForOPTIONS.getProperties();
    } catch (err) {
      error = err;
    }

    assert.ok(error.statusCode === 403);
    assert.ok(
      error.message.includes(
        "CORS not enabled or no matching rule found for this request."
      )
    );

    origin = "test";
    requestMethod = "GET";

    pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, requestMethod)
    );
    serviceClientForOPTIONS = new QueueServiceClient(baseURL, pipeline);

    const res = await serviceClientForOPTIONS.getProperties();
    assert.ok(res._response.status === 200);
  });

  it("OPTIONS request should not work without Origin header or matching allowedOrigins @loki", async () => {
    const serviceProperties = await serviceClient.getProperties();

    const newCORS = {
      allowedHeaders: "header",
      allowedMethods: "GET",
      allowedOrigins: "test",
      exposedHeaders: "*",
      maxAgeInSeconds: 8888
    };

    serviceProperties.cors = [newCORS];

    await serviceClient.setProperties(serviceProperties);

    await sleep(100);

    const origin = "Origin";
    const requestMethod = "GET";

    let pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, requestMethod)
    );
    let serviceClientForOPTIONS = new QueueServiceClient(baseURL, pipeline);

    let error;
    try {
      await serviceClientForOPTIONS.getProperties();
    } catch (err) {
      error = err;
    }

    assert.ok(error.statusCode === 403);
    assert.ok(
      error.message.includes(
        "CORS not enabled or no matching rule found for this request."
      )
    );

    pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(undefined, requestMethod)
    );
    serviceClientForOPTIONS = new QueueServiceClient(baseURL, pipeline);

    try {
      await serviceClientForOPTIONS.getProperties();
    } catch (err) {
      error = err;
    }

    assert.ok(error.statusCode === 403);
    assert.ok(
      error.message.includes(
        "CORS not enabled or no matching rule found for this request."
      )
    );
  });

  it("OPTIONS request should not work without requestMethod header or matching allowedMethods @loki", async () => {
    const serviceProperties = await serviceClient.getProperties();

    const newCORS = {
      allowedHeaders: "header",
      allowedMethods: "GET",
      allowedOrigins: "test",
      exposedHeaders: "*",
      maxAgeInSeconds: 8888
    };

    serviceProperties.cors = [newCORS];

    await serviceClient.setProperties(serviceProperties);

    await sleep(100);

    const origin = "test";
    const requestMethod = "PUT";

    let pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, requestMethod)
    );
    let serviceClientForOPTIONS = new QueueServiceClient(baseURL, pipeline);

    let error;
    try {
      await serviceClientForOPTIONS.getProperties();
    } catch (err) {
      error = err;
    }

    assert.ok(error.statusCode === 403);
    assert.ok(
      error.message.includes(
        "CORS not enabled or no matching rule found for this request."
      )
    );

    pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, undefined)
    );
    serviceClientForOPTIONS = new QueueServiceClient(baseURL, pipeline);

    try {
      await serviceClientForOPTIONS.getProperties();
    } catch (err) {
      error = err;
    }

    assert.ok(error.statusCode === 400);
    assert.ok(error.message.includes("A required CORS header is not present."));
  });

  it("OPTIONS request should check the defined requestHeaders @loki", async () => {
    const serviceProperties = await serviceClient.getProperties();

    const newCORS = [
      {
        allowedHeaders: "header",
        allowedMethods: "GET",
        allowedOrigins: "test",
        exposedHeaders: "*",
        maxAgeInSeconds: 8888
      },
      {
        allowedHeaders: "*",
        allowedMethods: "PUT",
        allowedOrigins: "test",
        exposedHeaders: "*",
        maxAgeInSeconds: 8888
      },
      {
        allowedHeaders: "head*",
        allowedMethods: "POST",
        allowedOrigins: "test",
        exposedHeaders: "*",
        maxAgeInSeconds: 8888
      }
    ];

    serviceProperties.cors = newCORS;

    await serviceClient.setProperties(serviceProperties);

    await sleep(100);

    // No match
    let origin = "test";
    let requestMethod = "GET";
    let requestHeaders = "head";

    let pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, requestMethod, requestHeaders)
    );
    let serviceClientForOPTIONS = new QueueServiceClient(baseURL, pipeline);

    let error;
    try {
      await serviceClientForOPTIONS.getProperties();
    } catch (err) {
      error = err;
    }

    assert.ok(error.statusCode === 403);
    assert.ok(
      error.message.includes(
        "CORS not enabled or no matching rule found for this request."
      )
    );

    // Match first cors.
    origin = "test";
    requestMethod = "GET";
    requestHeaders = "header";

    pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, requestMethod, requestHeaders)
    );
    serviceClientForOPTIONS = new QueueServiceClient(baseURL, pipeline);

    let res = await serviceClientForOPTIONS.getProperties();
    assert.ok(res._response.status === 200);

    // Match second cors.
    origin = "test";
    requestMethod = "PUT";
    requestHeaders = "head";

    pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, requestMethod, requestHeaders)
    );
    serviceClientForOPTIONS = new QueueServiceClient(baseURL, pipeline);

    res = await serviceClientForOPTIONS.getProperties();
    assert.ok(res._response.status === 200);

    // No match.
    origin = "test";
    requestMethod = "POST";
    requestHeaders = "hea";

    pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, requestMethod, requestHeaders)
    );
    serviceClientForOPTIONS = new QueueServiceClient(baseURL, pipeline);

    error;
    try {
      await serviceClientForOPTIONS.getProperties();
    } catch (err) {
      error = err;
    }

    assert.ok(error.statusCode === 403);
    assert.ok(
      error.message.includes(
        "CORS not enabled or no matching rule found for this request."
      )
    );

    // Match third cors.
    origin = "test";
    requestMethod = "POST";
    requestHeaders = "headerheader";

    pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, requestMethod, requestHeaders)
    );
    serviceClientForOPTIONS = new QueueServiceClient(baseURL, pipeline);

    res = await serviceClientForOPTIONS.getProperties();
    assert.ok(res._response.status === 200);
  });

  it("OPTIONS request should work with matching rule containing Origin * @loki", async () => {
    const serviceProperties = await serviceClient.getProperties();

    const newCORS = {
      allowedHeaders: "header",
      allowedMethods: "GET",
      allowedOrigins: "*",
      exposedHeaders: "*",
      maxAgeInSeconds: 8888
    };

    serviceProperties.cors = [newCORS];

    await serviceClient.setProperties(serviceProperties);

    await sleep(100);

    const origin = "anyOrigin";
    const requestMethod = "GET";

    const pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, requestMethod)
    );
    const serviceClientForOPTIONS = new QueueServiceClient(baseURL, pipeline);

    const res = await serviceClientForOPTIONS.getProperties();
    assert.ok(res._response.status === 200);
  });

  it("Response of request to service without cors rules should not contains cors info @loki", async () => {
    const serviceProperties = await serviceClient.getProperties();

    serviceProperties.cors = [];

    await serviceClient.setProperties(serviceProperties);

    await sleep(100);

    const origin = "anyOrigin";
    const pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(new OriginPolicyFactory(origin));
    const serviceClientWithOrigin = new QueueServiceClient(baseURL, pipeline);

    const res: any = await serviceClientWithOrigin.getProperties();

    assert.ok(res["access-control-allow-origin"] === undefined);
    assert.ok(res["access-control-expose-headers"] === undefined);
    assert.ok(res.vary === undefined);
  });

  it("Service with mismatching cors rules should response header Vary @loki", async () => {
    const serviceProperties = await serviceClient.getProperties();

    const newCORS = {
      allowedHeaders: "header",
      allowedMethods: "GET",
      allowedOrigins: "test",
      exposedHeaders: "*",
      maxAgeInSeconds: 8888
    };

    serviceProperties.cors = [newCORS];

    await serviceClient.setProperties(serviceProperties);

    await sleep(100);

    const origin = "anyOrigin";
    const pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(new OriginPolicyFactory(origin));
    const serviceClientWithOrigin = new QueueServiceClient(baseURL, pipeline);

    let res: any = await serviceClientWithOrigin.getProperties();
    assert.ok(res.vary !== undefined);

    res = await serviceClient.getProperties();
    assert.ok(res.vary === undefined);
  });

  it("Request Match rule exists that allows all origins (*) @loki", async () => {
    const serviceProperties = await serviceClient.getProperties();

    const newCORS = {
      allowedHeaders: "header",
      allowedMethods: "GET",
      allowedOrigins: "*",
      exposedHeaders: "*",
      maxAgeInSeconds: 8888
    };

    serviceProperties.cors = [newCORS];

    await serviceClient.setProperties(serviceProperties);

    await sleep(100);

    const origin = "anyOrigin";
    const pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(new OriginPolicyFactory(origin));
    const serviceClientWithOrigin = new QueueServiceClient(baseURL, pipeline);

    let res: any = await serviceClientWithOrigin.getProperties();
    assert.ok(res["access-control-allow-origin"] === "*");
    assert.ok(res.vary === undefined);
    assert.ok(res["access-control-expose-headers"] !== undefined);

    res = await serviceClient.getProperties();
    assert.ok(res["access-control-allow-origin"] === undefined);
    assert.ok(res.vary === undefined);
    assert.ok(res["access-control-expose-headers"] === undefined);
  });

  it("Request Match rule exists for exact origin @loki", async () => {
    const serviceProperties = await serviceClient.getProperties();

    const newCORS = {
      allowedHeaders: "header",
      allowedMethods: "GET",
      allowedOrigins: "exactOrigin",
      exposedHeaders: "*",
      maxAgeInSeconds: 8888
    };

    serviceProperties.cors = [newCORS];

    await serviceClient.setProperties(serviceProperties);

    await sleep(100);

    const origin = "exactOrigin";
    const pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(new OriginPolicyFactory(origin));
    const serviceClientWithOrigin = new QueueServiceClient(baseURL, pipeline);

    const res: any = await serviceClientWithOrigin.getProperties();
    assert.ok(res["access-control-allow-origin"] === origin);
    assert.ok(res.vary !== undefined);
    assert.ok(res["access-control-expose-headers"] !== undefined);
  });

  it("Requests with error response should apply for CORS @loki", async () => {
    const serviceProperties = await serviceClient.getProperties();

    const newCORS = {
      allowedHeaders: "header",
      allowedMethods: "GET",
      allowedOrigins: "exactOrigin",
      exposedHeaders: "*",
      maxAgeInSeconds: 8888
    };

    serviceProperties.cors = [newCORS];

    await serviceClient.setProperties(serviceProperties);

    await sleep(100);

    const origin = "exactOrigin";
    const pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(new OriginPolicyFactory(origin));
    const serviceClientWithOrigin = new QueueServiceClient(baseURL, pipeline);

    const queueClientWithOrigin = serviceClientWithOrigin.getQueueClient(
      "nonexistentcontainer"
    );

    try {
      await queueClientWithOrigin.getProperties();
    } catch (err) {
      assert.ok(
        err.response.headers._headersMap["access-control-allow-origin"]
          .value === origin
      );
      assert.ok(err.response.headers._headersMap.vary !== undefined);
      assert.ok(
        err.response.headers._headersMap["access-control-expose-headers"] !==
          undefined
      );
    }
  });

  it("Request Match rule in sequence @loki", async () => {
    const serviceProperties = await serviceClient.getProperties();

    const newCORS = [
      {
        allowedHeaders: "header",
        allowedMethods: "GET",
        allowedOrigins: "exactOrigin",
        exposedHeaders: "*",
        maxAgeInSeconds: 8888
      },
      {
        allowedHeaders: "header",
        allowedMethods: "GET",
        allowedOrigins: "*",
        exposedHeaders: "*",
        maxAgeInSeconds: 8888
      }
    ];

    serviceProperties.cors = newCORS;

    await serviceClient.setProperties(serviceProperties);

    await sleep(100);

    const origin = "exactOrigin";
    const pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(new OriginPolicyFactory(origin));
    const serviceClientWithOrigin = new QueueServiceClient(baseURL, pipeline);

    const res: any = await serviceClientWithOrigin.getProperties();
    assert.ok(res["access-control-allow-origin"] === origin);
    assert.ok(res.vary !== undefined);
    assert.ok(res["access-control-expose-headers"] !== undefined);
  });
});
