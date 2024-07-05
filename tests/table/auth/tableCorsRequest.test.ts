import * as assert from "assert";
import { TableServiceClient } from "@azure/data-tables";
import { AzureNamedKeyCredential } from "@azure/core-auth";
import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  sleep
} from "../../testutils";
import {
  createTableServerForTestHttps,
  HOST,
  PORT
} from "../utils/table.entity.test.utils";
import OPTIONSRequestPolicy from "../RequestPolicy/OPTIONSRequestPolicy";
import OriginPolicy from "../RequestPolicy/OriginPolicy";

// Set true to enable debug log
configLogger(false);

const sharedKeyCredential = new AzureNamedKeyCredential(
  EMULATOR_ACCOUNT_NAME,
  EMULATOR_ACCOUNT_KEY
);

describe("table Entity APIs test", () => {
  let server: TableServer;
  const baseURL = `https://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}`;

  const serviceClient = new TableServiceClient(baseURL, sharedKeyCredential);

  const requestOverride = { headers: {} };

  before(async () => {
    server = createTableServerForTestHttps();
    await server.start();
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
  });

  after(async () => {
    await server.close();
  });

  it("OPTIONS request without cors rules in server should fail @loki", async () => {
    const serviceProperties = await serviceClient.getProperties();
    serviceProperties.cors = [];
    await serviceClient.setProperties(serviceProperties);

    const customPolicy = new OPTIONSRequestPolicy(
      "OPTIONSpolicy",
      "Origin",
      "GET"
    );

    const serviceClientForOPTIONS = new TableServiceClient(
      baseURL,
      sharedKeyCredential
    );

    serviceClientForOPTIONS.pipeline.addPolicy(customPolicy);

    let error;
    try {
      await serviceClientForOPTIONS.getProperties();
    } catch (err: any) {
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

    let customPolicy = new OPTIONSRequestPolicy(
      "OPTIONSpolicy",
      "Origin",
      "GET"
    );

    let serviceClientForOPTIONS = new TableServiceClient(
      baseURL,
      sharedKeyCredential
    );

    serviceClientForOPTIONS.pipeline.addPolicy(customPolicy);

    let error;
    try {
      await serviceClientForOPTIONS.getProperties();
    } catch (err: any) {
      error = err;
    }

    assert.ok(error.statusCode === 403);
    assert.ok(
      error.message.includes(
        "CORS not enabled or no matching rule found for this request."
      )
    );

    customPolicy = new OPTIONSRequestPolicy("OPTIONSpolicy", "test", "GET");

    serviceClientForOPTIONS = new TableServiceClient(
      baseURL,
      sharedKeyCredential
    );

    serviceClientForOPTIONS.pipeline.addPolicy(customPolicy);

    // getProperties() call is expected to execute correctly
    await serviceClientForOPTIONS.getProperties();
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

    let customPolicy = new OPTIONSRequestPolicy(
      "OPTIONSpolicy",
      "Origin",
      "GET"
    );

    let serviceClientForOPTIONS = new TableServiceClient(
      baseURL,
      sharedKeyCredential
    );

    serviceClientForOPTIONS.pipeline.addPolicy(customPolicy);

    let error;
    try {
      await serviceClientForOPTIONS.getProperties();
    } catch (err: any) {
      error = err;
    }

    assert.ok(error.statusCode === 403);
    assert.ok(
      error.message.includes(
        "CORS not enabled or no matching rule found for this request."
      )
    );

    customPolicy = new OPTIONSRequestPolicy("OPTIONSpolicy", undefined, "GET");

    serviceClientForOPTIONS = new TableServiceClient(
      baseURL,
      sharedKeyCredential
    );

    serviceClientForOPTIONS.pipeline.addPolicy(customPolicy);

    try {
      await serviceClientForOPTIONS.getProperties();
    } catch (err: any) {
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

    let customPolicy = new OPTIONSRequestPolicy("OPTIONSpolicy", "test", "PUT");

    let serviceClientForOPTIONS = new TableServiceClient(
      baseURL,
      sharedKeyCredential
    );

    serviceClientForOPTIONS.pipeline.addPolicy(customPolicy);

    let error;
    try {
      await serviceClientForOPTIONS.getProperties();
    } catch (err: any) {
      error = err;
    }

    assert.ok(error.statusCode === 403);
    assert.ok(
      error.message.includes(
        "CORS not enabled or no matching rule found for this request."
      )
    );

    customPolicy = new OPTIONSRequestPolicy("OPTIONSpolicy", "test", undefined);

    serviceClientForOPTIONS = new TableServiceClient(
      baseURL,
      sharedKeyCredential
    );

    serviceClientForOPTIONS.pipeline.addPolicy(customPolicy);

    try {
      await serviceClientForOPTIONS.getProperties();
    } catch (err: any) {
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

    let customPolicy = new OPTIONSRequestPolicy(
      "OPTIONSpolicy",
      "test",
      "GET",
      "head"
    );

    let serviceClientForOPTIONS = new TableServiceClient(
      baseURL,
      sharedKeyCredential
    );

    serviceClientForOPTIONS.pipeline.addPolicy(customPolicy);

    let error;
    try {
      await serviceClientForOPTIONS.getProperties();
    } catch (err: any) {
      error = err;
    }

    assert.ok(error.statusCode === 403);
    assert.ok(
      error.message.includes(
        "CORS not enabled or no matching rule found for this request."
      )
    );

    // Match first cors.
    customPolicy = new OPTIONSRequestPolicy(
      "OPTIONSpolicy",
      "test",
      "GET",
      "header"
    );

    serviceClientForOPTIONS = new TableServiceClient(
      baseURL,
      sharedKeyCredential
    );

    serviceClientForOPTIONS.pipeline.addPolicy(customPolicy);

    // getProperties() call is expected to execute correctly
    await serviceClientForOPTIONS.getProperties();

    // Match second cors.
    customPolicy = new OPTIONSRequestPolicy(
      "OPTIONSpolicy",
      "test",
      "PUT",
      "head"
    );

    serviceClientForOPTIONS = new TableServiceClient(
      baseURL,
      sharedKeyCredential
    );

    serviceClientForOPTIONS.pipeline.addPolicy(customPolicy);

    // getProperties() call is expected to execute correctly
    await serviceClientForOPTIONS.getProperties();

    // No match.
    customPolicy = new OPTIONSRequestPolicy(
      "OPTIONSpolicy",
      "test",
      "POST",
      "hea"
    );

    serviceClientForOPTIONS = new TableServiceClient(
      baseURL,
      sharedKeyCredential
    );

    serviceClientForOPTIONS.pipeline.addPolicy(customPolicy);

    try {
      await serviceClientForOPTIONS.getProperties();
    } catch (err: any) {
      error = err;
    }

    assert.ok(error.statusCode === 403);
    assert.ok(
      error.message.includes(
        "CORS not enabled or no matching rule found for this request."
      )
    );

    // Match third cors.
    customPolicy = new OPTIONSRequestPolicy(
      "OPTIONSpolicy",
      "test",
      "POST",
      "headerheader"
    );

    serviceClientForOPTIONS = new TableServiceClient(
      baseURL,
      sharedKeyCredential
    );

    serviceClientForOPTIONS.pipeline.addPolicy(customPolicy);

    // getProperties() call is expected to execute correctly
    await serviceClientForOPTIONS.getProperties();
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

    const customPolicy = new OPTIONSRequestPolicy(
      "OPTIONSpolicy",
      "anyOrigin",
      "GET"
    );

    const serviceClientForOPTIONS = new TableServiceClient(
      baseURL,
      sharedKeyCredential
    );

    serviceClientForOPTIONS.pipeline.addPolicy(customPolicy);

    // getProperties() call is expected to execute correctly
    await serviceClientForOPTIONS.getProperties();
  });

  it("Response of request to service without cors rules should not contain cors info @loki", async () => {
    const serviceProperties = await serviceClient.getProperties();

    serviceProperties.cors = [];

    await serviceClient.setProperties(serviceProperties);

    await sleep(100);

    const customPolicy = new OriginPolicy("Originpolicy", "anyOrigin");

    const serviceClientWithOrigin = new TableServiceClient(
      baseURL,
      sharedKeyCredential
    );

    serviceClientWithOrigin.pipeline.addPolicy(customPolicy);

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

    const customPolicy = new OriginPolicy("Originpolicy", "anyOrigin");

    const serviceClientWithOrigin = new TableServiceClient(
      baseURL,
      sharedKeyCredential
    );

    serviceClientWithOrigin.pipeline.addPolicy(customPolicy);

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

    const customPolicy = new OriginPolicy("Originpolicy", "anyOrigin");

    const serviceClientWithOrigin = new TableServiceClient(
      baseURL,
      sharedKeyCredential
    );

    serviceClientWithOrigin.pipeline.addPolicy(customPolicy);

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

    const customPolicy = new OriginPolicy("Originpolicy", "exactOrigin");

    const serviceClientWithOrigin = new TableServiceClient(
      baseURL,
      sharedKeyCredential
    );

    serviceClientWithOrigin.pipeline.addPolicy(customPolicy);

    const res: any = await serviceClientWithOrigin.getProperties();
    assert.ok(res["access-control-allow-origin"] === "exactOrigin");
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

    const customPolicy = new OriginPolicy("Originpolicy", "exactOrigin");

    const serviceClientWithOrigin = new TableServiceClient(
      baseURL,
      sharedKeyCredential
    );

    serviceClientWithOrigin.pipeline.addPolicy(customPolicy);

    try {
      await serviceClientWithOrigin.getProperties();
    } catch (err: any) {
      assert.ok(
        err.response.headers._headersMap["access-control-allow-origin"]
          .value === "exactOrigin"
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

    const customPolicy = new OriginPolicy("Originpolicy", "exactOrigin");

    const serviceClientWithOrigin = new TableServiceClient(
      baseURL,
      sharedKeyCredential
    );

    serviceClientWithOrigin.pipeline.addPolicy(customPolicy);

    const res: any = await serviceClientWithOrigin.getProperties();
    assert.ok(res["access-control-allow-origin"] === "exactOrigin");
    assert.ok(res.vary !== undefined);
    assert.ok(res["access-control-expose-headers"] !== undefined);
  });
});
