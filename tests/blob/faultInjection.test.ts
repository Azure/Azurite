import * as assert from "assert";
import {
  BlobServiceClient,
  BlockBlobClient,
  ContainerClient,
  newPipeline,
  Pipeline,
  StorageSharedKeyCredential,
  WebResource
} from "@azure/storage-blob";

import { configLogger } from "../../src/common/Logger";
import BlobTestServerFactory from "../BlobTestServerFactory";
import {
  bodyToString,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../testutils";

import { requestInjectorPolicy } from "../utils/RequestInjectorPolicy";

// Set true to enable debug log
configLogger(true);

describe("Fault Injection", () => {
  const factory = new BlobTestServerFactory();
  const server = factory.createServer();
  const baseURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1`;
  const pipelineOptions = {
    retryOptions: { maxTries: 1 },
    // Make sure socket is closed once the operation is done.
    keepAliveOptions: { enable: false }
    // proxyOptions: {
    //   host: "localhost",
    //   port: 8888
    // }
  };
  const serviceClient = new BlobServiceClient(
    baseURL,
    newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      pipelineOptions
    )
  );

  const body = "Hello World";

  let containerClient: ContainerClient;
  let blockBlobClient: BlockBlobClient;

  beforeEach(async () => {
    const containerName = getUniqueName("container");
    containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();
    const blobName = getUniqueName("blob");
    blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.upload(body, body.length);
  });

  afterEach(async function() {
    await containerClient.delete();
  });

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  it("ServerInternalError @loki @sql", async () => {
    const faultInjectFactory = requestInjectorPolicy({
      "fault-inject": "ServerInternalError"
    });

    const factories = (blockBlobClient as any).pipeline.factories.slice(); // clone factories array
    factories.unshift(faultInjectFactory);
    const injectedPipeline = new Pipeline(factories);
    blockBlobClient = new BlockBlobClient(
      blockBlobClient.url,
      injectedPipeline
    );

    try {
      const body: string = "randomstring";
      await blockBlobClient.upload(body, body.length);
    } catch (err) {
      assert.deepStrictEqual(err.statusCode, 500);
    }
  });

  it("NoResponseThenWaitIndefinitely @loki @sql", async () => {
    const faultInjectFactory = requestInjectorPolicy(
      {
        "fault-inject": "NoResponseThenWaitIndefinitely"
      },
      (req: WebResource) => {
        req.timeout = 60 * 1000;
      }
    );

    const factories = (blockBlobClient as any).pipeline.factories.slice(); // clone factories array
    factories.unshift(faultInjectFactory);
    const injectedPipeline = new Pipeline(factories);
    blockBlobClient = new BlockBlobClient(
      blockBlobClient.url,
      injectedPipeline
    );

    try {
      const body: string = "randomstring";
      await blockBlobClient.upload(body, body.length);
    } catch (err) {
      assert.deepStrictEqual(err.name, "AbortError");
    }
  });

  it("NoResponseThenCloseConnection @loki @sql", async () => {
    const faultInjectFactory = requestInjectorPolicy({
      "fault-inject": "NoResponseThenCloseConnection"
    });

    const factories = (blockBlobClient as any).pipeline.factories.slice(); // clone factories array
    factories.unshift(faultInjectFactory);
    const injectedPipeline = new Pipeline(factories);
    blockBlobClient = new BlockBlobClient(
      blockBlobClient.url,
      injectedPipeline
    );

    try {
      const body: string = "randomstring";
      await blockBlobClient.upload(body, body.length);
    } catch (err) {
      assert.deepStrictEqual(err.code, "ECONNRESET");
    }
  });

  it("PartialResponseThenWaitIndefinitely @loki @sql", async () => {
    const body: string = "randomstring";
    await blockBlobClient.upload(body, body.length);

    const faultInjectFactory = requestInjectorPolicy(
      {
        "fault-inject": "PartialResponseThenWaitIndefinitely"
      },
      (req: WebResource) => {
        req.timeout = 60 * 1000;
      }
    );

    const factories = (blockBlobClient as any).pipeline.factories.slice(); // clone factories array
    factories.unshift(faultInjectFactory);
    const injectedPipeline = new Pipeline(factories);
    blockBlobClient = new BlockBlobClient(
      blockBlobClient.url,
      injectedPipeline
    );

    try {
      const res = await blockBlobClient.download();
      const resStr = await bodyToString(res); // without proxy
      assert.deepStrictEqual(resStr, body.slice(0, body.length - 1));
    } catch (err) {
      // when using fiddler as proxy
      console.log(err);
      assert.deepStrictEqual(err.name, "AbortError");
    }
  });

  it("PartialResponseThenCloseConnection @loki @sql", async () => {
    const body: string = "randomstring";
    await blockBlobClient.upload(body, body.length);

    const faultInjectFactory = requestInjectorPolicy({
      "fault-inject": "PartialResponseThenCloseConnection"
    });

    const factories = (blockBlobClient as any).pipeline.factories.slice(); // clone factories array
    factories.unshift(faultInjectFactory);
    const injectedPipeline = new Pipeline(factories);
    blockBlobClient = new BlockBlobClient(
      blockBlobClient.url,
      injectedPipeline
    );

    const res = await blockBlobClient.download();
    const resStr = await bodyToString(res);
    assert.deepStrictEqual(resStr, body.slice(0, body.length - 1));
  });

  it("PartialResponseThenCloseConnection for xml body @loki @sql", async () => {
    const body: string = "randomstring";
    await blockBlobClient.upload(body, body.length);

    const faultInjectFactory = requestInjectorPolicy({
      "fault-inject": "PartialResponseThenCloseConnection"
    });

    const factories = (blockBlobClient as any).pipeline.factories.slice(); // clone factories array
    factories.unshift(faultInjectFactory);
    const injectedPipeline = new Pipeline(factories);
    const contaianerClientInjected = new ContainerClient(
      containerClient.url,
      injectedPipeline
    );

    const listIter = contaianerClientInjected.listBlobsFlat();
    let exceptionCaught = false;
    try {
      await listIter.next();
    } catch (err) {
      exceptionCaught = true;
      assert.ok(err.message.includes("Error: Unclosed root tag"));
    }
    assert.ok(exceptionCaught);
  });

  it("PartialResponseThenCloseConnection for empty result @loki @sql", async () => {
    const body: string = "r";
    await blockBlobClient.upload(body, body.length);

    const faultInjectFactory = requestInjectorPolicy({
      "fault-inject": "PartialResponseThenCloseConnection"
    });

    const factories = (blockBlobClient as any).pipeline.factories.slice(); // clone factories array
    factories.unshift(faultInjectFactory);
    const injectedPipeline = new Pipeline(factories);
    blockBlobClient = new BlockBlobClient(
      blockBlobClient.url,
      injectedPipeline
    );

    try {
      await blockBlobClient.download();
    } catch (err) {
      assert.deepStrictEqual(err.code, "ECONNRESET");
    }
  });
});
