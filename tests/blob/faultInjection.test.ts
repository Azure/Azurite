import {
  BlobServiceClient,
  BlockBlobClient,
  ContainerClient,
  newPipeline,
  Pipeline,
  StorageSharedKeyCredential
} from "@azure/storage-blob";

import { configLogger } from "../../src/common/Logger";
import BlobTestServerFactory from "../BlobTestServerFactory";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../testutils";
import { requestInjectorPolicy } from "../utils/RequestInjectorPolicy";

// Set true to enable debug log
configLogger(true);

// tslint:disable:no-empty
describe.only("Fault Injection", () => {
  const factory = new BlobTestServerFactory();
  const server = factory.createServer();
  const baseURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1`;
  const pipelineOptions = {
    retryOptions: { maxTries: 1 },
    // Make sure socket is closed once the operation is done.
    keepAliveOptions: { enable: false }
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

  it(`serverInternalError`, async () => {
    const factories = (containerClient as any).pipeline.factories.slice(); // clone factories array
    const headerInjector = requestInjectorPolicy({
      "fault-inject": "serverInternalError"
    });
    factories.unshift(headerInjector);
    const injectedPipeline = new Pipeline(factories);
    blockBlobClient = new BlockBlobClient(
      blockBlobClient.url,
      injectedPipeline
    );
    try {
      await blockBlobClient.upload(body, body.length);
    } catch (err) {
      console.log(err);
    }
  });

  it(`another test`, async () => {
    await blockBlobClient.upload(body, body.length);
  });
});
