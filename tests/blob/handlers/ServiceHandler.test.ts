import {
  Aborter,
  AnonymousCredential,
  ServiceURL,
  StorageURL,
} from "@azure/storage-blob";
import * as assert from "assert";
import { rmdirSync, unlinkSync } from "fs";

import BlobConfiguration from "../../../src/blob/BlobConfiguration";
import Server from "../../../src/blob/BlobServer";

// TODO: Create a server factory as tests utils
const host = "127.0.0.1";
const port = 11000;
const dbPath = "__testsstorage__";
const persistencePath = "__testspersistence__";
const config = new BlobConfiguration(host, port, dbPath, persistencePath);

// TODO: Create serviceURL factory as tests utils
const baseURL = `http://${host}:${port}/devaccount`;
const serviceURL = new ServiceURL(
  baseURL,
  StorageURL.newPipeline(new AnonymousCredential(), {
    retryOptions: { maxTries: 1 },
  }),
);

let server: Server;

describe("ServiceHandler", () => {
  before(async () => {
    server = new Server(config);
    await server.start();
  });

  after(async () => {
    await server.close();
    unlinkSync(dbPath);
    rmdirSync(persistencePath);
  });

  it("GetServiceProperties", async () => {
    const result = await serviceURL.getProperties(Aborter.none);

    assert.ok(typeof result.requestId);
    assert.ok(result.requestId!.length > 0);
    assert.ok(typeof result.version);
    assert.ok(result.version!.length > 0);

    if (result.cors && result.cors!.length > 0) {
      assert.ok(result.cors![0].allowedHeaders.length > 0);
      assert.ok(result.cors![0].allowedMethods.length > 0);
      assert.ok(result.cors![0].allowedOrigins.length > 0);
      assert.ok(result.cors![0].exposedHeaders.length > 0);
      assert.ok(result.cors![0].maxAgeInSeconds >= 0);
    }
  });

  it("SetServiceProperties", async () => {
    const serviceProperties = await serviceURL.getProperties(Aborter.none);

    serviceProperties.logging = {
      deleteProperty: true,
      read: true,
      retentionPolicy: {
        days: 5,
        enabled: true,
      },
      version: "1.0",
      write: true,
    };

    serviceProperties.minuteMetrics = {
      enabled: true,
      includeAPIs: true,
      retentionPolicy: {
        days: 4,
        enabled: true,
      },
      version: "1.0",
    };

    serviceProperties.hourMetrics = {
      enabled: true,
      includeAPIs: true,
      retentionPolicy: {
        days: 3,
        enabled: true,
      },
      version: "1.0",
    };

    const newCORS = {
      allowedHeaders: "*",
      allowedMethods: "GET",
      allowedOrigins: "example.com",
      exposedHeaders: "*",
      maxAgeInSeconds: 8888,
    };
    if (!serviceProperties.cors) {
      serviceProperties.cors = [newCORS];
    } else if (serviceProperties.cors!.length < 5) {
      serviceProperties.cors.push(newCORS);
    }

    if (!serviceProperties.deleteRetentionPolicy) {
      serviceProperties.deleteRetentionPolicy = {
        days: 2,
        enabled: false,
      };
    }

    await serviceURL.setProperties(Aborter.none, serviceProperties);

    const result = await serviceURL.getProperties(Aborter.none);
    assert.ok(typeof result.requestId);
    assert.ok(result.requestId!.length > 0);
    assert.ok(typeof result.version);
    assert.ok(result.version!.length > 0);
    assert.deepEqual(result.hourMetrics, serviceProperties.hourMetrics);
  });
});
