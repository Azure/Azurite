import {
  Aborter,
  ServiceURL,
  SharedKeyCredential,
  StorageURL
} from "@azure/storage-queue";
import * as assert from "assert";

import { configLogger } from "../../src/common/Logger";
import BlobTestServerFactory from "../BlobTestServerFactory";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  sleep
} from "../testutils";
import OPTIONSRequestPolicyFactory from "./RequestPolicy/OPTIONSRequestPolicyFactory";
import OriginPolicyFactory from "./RequestPolicy/OriginPolicyFactory";

// Set true to enable debug log
configLogger(false);

describe("Blob Cors requests test", () => {
  const factory = new BlobTestServerFactory();
  const server = factory.createServer();

  const baseURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1`;
  const serviceURL = new ServiceURL(
    baseURL,
    StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    )
  );

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  it("OPTIONS request without cors rules in server should be fail", async () => {
    const serviceProperties = await serviceURL.getProperties(Aborter.none);
    serviceProperties.cors = [];
    await serviceURL.setProperties(Aborter.none, serviceProperties);

    const origin = "Origin";
    const requestMethod = "GET";

    const pipeline = StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, requestMethod)
    );
    const serviceURLforOPTIONS = new ServiceURL(baseURL, pipeline);

    let error;
    try {
      await serviceURLforOPTIONS.getProperties(Aborter.none);
    } catch (err) {
      error = err;
    }

    assert.ok(error.statusCode === 403);
    assert.ok(
      error.body.message.includes(
        "CORS not enabled or no matching rule found for this request."
      )
    );
  });

  it("OPTIONS request should not work without matching cors rules", async () => {
    const serviceProperties = await serviceURL.getProperties(Aborter.none);

    const newCORS = {
      allowedHeaders: "header",
      allowedMethods: "GET",
      allowedOrigins: "test",
      exposedHeaders: "*",
      maxAgeInSeconds: 8888
    };

    serviceProperties.cors = [newCORS];

    await serviceURL.setProperties(Aborter.none, serviceProperties);

    await sleep(100);

    let origin = "Origin";
    let requestMethod = "GET";

    let pipeline = StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, requestMethod)
    );
    let serviceURLforOPTIONS = new ServiceURL(baseURL, pipeline);

    let error;
    try {
      await serviceURLforOPTIONS.getProperties(Aborter.none);
    } catch (err) {
      error = err;
    }

    assert.ok(error.statusCode === 403);
    assert.ok(
      error.body.message.includes(
        "CORS not enabled or no matching rule found for this request."
      )
    );

    origin = "test";
    requestMethod = "GET";

    pipeline = StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, requestMethod)
    );
    serviceURLforOPTIONS = new ServiceURL(baseURL, pipeline);

    const res = await serviceURLforOPTIONS.getProperties(Aborter.none);
    assert.ok(res._response.status === 200);
  });

  it("OPTIONS request should not work without Origin header or matching allowedOrigins", async () => {
    const serviceProperties = await serviceURL.getProperties(Aborter.none);

    const newCORS = {
      allowedHeaders: "header",
      allowedMethods: "GET",
      allowedOrigins: "test",
      exposedHeaders: "*",
      maxAgeInSeconds: 8888
    };

    serviceProperties.cors = [newCORS];

    await serviceURL.setProperties(Aborter.none, serviceProperties);

    await sleep(100);

    const origin = "Origin";
    const requestMethod = "GET";

    let pipeline = StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, requestMethod)
    );
    let serviceURLforOPTIONS = new ServiceURL(baseURL, pipeline);

    let error;
    try {
      await serviceURLforOPTIONS.getProperties(Aborter.none);
    } catch (err) {
      error = err;
    }

    assert.ok(error.statusCode === 403);
    assert.ok(
      error.body.message.includes(
        "CORS not enabled or no matching rule found for this request."
      )
    );

    pipeline = StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(undefined, requestMethod)
    );
    serviceURLforOPTIONS = new ServiceURL(baseURL, pipeline);

    try {
      await serviceURLforOPTIONS.getProperties(Aborter.none);
    } catch (err) {
      error = err;
    }

    assert.ok(error.statusCode === 403);
    assert.ok(
      error.body.message.includes(
        "CORS not enabled or no matching rule found for this request."
      )
    );
  });

  it("OPTIONS request should not work without requestMethod header or matching allowedMethods", async () => {
    const serviceProperties = await serviceURL.getProperties(Aborter.none);

    const newCORS = {
      allowedHeaders: "header",
      allowedMethods: "GET",
      allowedOrigins: "test",
      exposedHeaders: "*",
      maxAgeInSeconds: 8888
    };

    serviceProperties.cors = [newCORS];

    await serviceURL.setProperties(Aborter.none, serviceProperties);

    await sleep(100);

    const origin = "test";
    const requestMethod = "PUT";

    let pipeline = StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, requestMethod)
    );
    let serviceURLforOPTIONS = new ServiceURL(baseURL, pipeline);

    let error;
    try {
      await serviceURLforOPTIONS.getProperties(Aborter.none);
    } catch (err) {
      error = err;
    }

    assert.ok(error.statusCode === 403);
    assert.ok(
      error.body.message.includes(
        "CORS not enabled or no matching rule found for this request."
      )
    );

    pipeline = StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, undefined)
    );
    serviceURLforOPTIONS = new ServiceURL(baseURL, pipeline);

    try {
      await serviceURLforOPTIONS.getProperties(Aborter.none);
    } catch (err) {
      error = err;
    }

    assert.ok(error.statusCode === 400);
    assert.ok(
      error.body.message.includes("A required CORS header is not present.")
    );
  });

  it("OPTIONS request should check the defined requestHeaders", async () => {
    const serviceProperties = await serviceURL.getProperties(Aborter.none);

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

    await serviceURL.setProperties(Aborter.none, serviceProperties);

    await sleep(100);

    // No match
    let origin = "test";
    let requestMethod = "GET";
    let reqestHeaders = "head";

    let pipeline = StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, requestMethod, reqestHeaders)
    );
    let serviceURLforOPTIONS = new ServiceURL(baseURL, pipeline);

    let error;
    try {
      await serviceURLforOPTIONS.getProperties(Aborter.none);
    } catch (err) {
      error = err;
    }

    assert.ok(error.statusCode === 403);
    assert.ok(
      error.body.message.includes(
        "CORS not enabled or no matching rule found for this request."
      )
    );

    // Match first cors.
    origin = "test";
    requestMethod = "GET";
    reqestHeaders = "header";

    pipeline = StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, requestMethod, reqestHeaders)
    );
    serviceURLforOPTIONS = new ServiceURL(baseURL, pipeline);

    let res = await serviceURLforOPTIONS.getProperties(Aborter.none);
    assert.ok(res._response.status === 200);

    // Match second cors.
    origin = "test";
    requestMethod = "PUT";
    reqestHeaders = "head";

    pipeline = StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, requestMethod, reqestHeaders)
    );
    serviceURLforOPTIONS = new ServiceURL(baseURL, pipeline);

    res = await serviceURLforOPTIONS.getProperties(Aborter.none);
    assert.ok(res._response.status === 200);

    // No match.
    origin = "test";
    requestMethod = "POST";
    reqestHeaders = "hea";

    pipeline = StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, requestMethod, reqestHeaders)
    );
    serviceURLforOPTIONS = new ServiceURL(baseURL, pipeline);

    error;
    try {
      await serviceURLforOPTIONS.getProperties(Aborter.none);
    } catch (err) {
      error = err;
    }

    assert.ok(error.statusCode === 403);
    assert.ok(
      error.body.message.includes(
        "CORS not enabled or no matching rule found for this request."
      )
    );

    // Match third cors.
    origin = "test";
    requestMethod = "POST";
    reqestHeaders = "headerheader";

    pipeline = StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, requestMethod, reqestHeaders)
    );
    serviceURLforOPTIONS = new ServiceURL(baseURL, pipeline);

    res = await serviceURLforOPTIONS.getProperties(Aborter.none);
    assert.ok(res._response.status === 200);
  });

  it("OPTIONS request should work with matching rule containing Origion *", async () => {
    const serviceProperties = await serviceURL.getProperties(Aborter.none);

    const newCORS = {
      allowedHeaders: "header",
      allowedMethods: "GET",
      allowedOrigins: "*",
      exposedHeaders: "*",
      maxAgeInSeconds: 8888
    };

    serviceProperties.cors = [newCORS];

    await serviceURL.setProperties(Aborter.none, serviceProperties);

    await sleep(100);

    const origin = "anyOrigin";
    const requestMethod = "GET";

    const pipeline = StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(
      new OPTIONSRequestPolicyFactory(origin, requestMethod)
    );
    const serviceURLforOPTIONS = new ServiceURL(baseURL, pipeline);

    const res = await serviceURLforOPTIONS.getProperties(Aborter.none);
    assert.ok(res._response.status === 200);
  });

  it("Response of request to service without cors rules should not contains cors info", async () => {
    const serviceProperties = await serviceURL.getProperties(Aborter.none);

    serviceProperties.cors = [];

    await serviceURL.setProperties(Aborter.none, serviceProperties);

    await sleep(100);

    const origin = "anyOrigin";
    const pipeline = StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(new OriginPolicyFactory(origin));
    const serviceURLwithOrigin = new ServiceURL(baseURL, pipeline);

    const res: any = await serviceURLwithOrigin.getProperties(Aborter.none);

    assert.ok(res["access-control-allow-origin"] === undefined);
    assert.ok(res["access-control-expose-headers"] === undefined);
    assert.ok(res.vary === undefined);
  });

  it("Service with mismatching cors rules should response header Vary", async () => {
    const serviceProperties = await serviceURL.getProperties(Aborter.none);

    const newCORS = {
      allowedHeaders: "header",
      allowedMethods: "GET",
      allowedOrigins: "test",
      exposedHeaders: "*",
      maxAgeInSeconds: 8888
    };

    serviceProperties.cors = [newCORS];

    await serviceURL.setProperties(Aborter.none, serviceProperties);

    await sleep(100);

    const origin = "anyOrigin";
    const pipeline = StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(new OriginPolicyFactory(origin));
    const serviceURLwithOrigin = new ServiceURL(baseURL, pipeline);

    let res: any = await serviceURLwithOrigin.getProperties(Aborter.none);
    assert.ok(res.vary !== undefined);

    res = await serviceURL.getProperties(Aborter.none);
    assert.ok(res.vary !== undefined);
  });

  it("Request Match rule exists that allows all origins (*)", async () => {
    const serviceProperties = await serviceURL.getProperties(Aborter.none);

    const newCORS = {
      allowedHeaders: "header",
      allowedMethods: "GET",
      allowedOrigins: "*",
      exposedHeaders: "*",
      maxAgeInSeconds: 8888
    };

    serviceProperties.cors = [newCORS];

    await serviceURL.setProperties(Aborter.none, serviceProperties);

    await sleep(100);

    const origin = "anyOrigin";
    const pipeline = StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(new OriginPolicyFactory(origin));
    const serviceURLwithOrigin = new ServiceURL(baseURL, pipeline);

    let res: any = await serviceURLwithOrigin.getProperties(Aborter.none);
    assert.ok(res["access-control-allow-origin"] === "*");
    assert.ok(res.vary === undefined);
    assert.ok(res["access-control-expose-headers"] !== undefined);

    res = await serviceURL.getProperties(Aborter.none);
    assert.ok(res["access-control-allow-origin"] === "*");
    assert.ok(res.vary === undefined);
    assert.ok(res["access-control-expose-headers"] !== undefined);
  });

  it("Request Match rule exists for exact origin", async () => {
    const serviceProperties = await serviceURL.getProperties(Aborter.none);

    const newCORS = {
      allowedHeaders: "header",
      allowedMethods: "GET",
      allowedOrigins: "exactOrigin",
      exposedHeaders: "*",
      maxAgeInSeconds: 8888
    };

    serviceProperties.cors = [newCORS];

    await serviceURL.setProperties(Aborter.none, serviceProperties);

    await sleep(100);

    const origin = "exactOrigin";
    const pipeline = StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(new OriginPolicyFactory(origin));
    const serviceURLwithOrigin = new ServiceURL(baseURL, pipeline);

    const res: any = await serviceURLwithOrigin.getProperties(Aborter.none);
    assert.ok(res["access-control-allow-origin"] === origin);
    assert.ok(res.vary !== undefined);
    assert.ok(res["access-control-expose-headers"] !== undefined);
  });

  it("Request Match rule in sequence", async () => {
    const serviceProperties = await serviceURL.getProperties(Aborter.none);

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

    await serviceURL.setProperties(Aborter.none, serviceProperties);

    await sleep(100);

    const origin = "exactOrigin";
    const pipeline = StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    );
    pipeline.factories.unshift(new OriginPolicyFactory(origin));
    const serviceURLwithOrigin = new ServiceURL(baseURL, pipeline);

    const res: any = await serviceURLwithOrigin.getProperties(Aborter.none);
    assert.ok(res["access-control-allow-origin"] === origin);
    assert.ok(res.vary !== undefined);
    assert.ok(res["access-control-expose-headers"] !== undefined);
  });
});
