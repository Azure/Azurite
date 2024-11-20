import {
  newPipeline,
  BlobServiceClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import * as assert from "assert";

import { configLogger } from "../../src/common/Logger";
import { DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT } from "../../src/blob/utils/constants";

import BlobTestServerFactory from "../BlobTestServerFactory";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
} from "../testutils";

// Set true to enable debug log
configLogger(false);

describe("Blob Keep-Alive header response test", () => {
  const factory = new BlobTestServerFactory();
  const server = factory.createServer();

  const baseURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1`;
  const blobServiceClient = new BlobServiceClient(
    baseURL,
    newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 },
        keepAliveOptions: { enable: true }
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

  it("request with enabled keep-alive shall return DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT", async () => {
    const properties = await blobServiceClient.getProperties();
    const keepAliveHeader = properties._response.headers.get("keep-alive");
    if (keepAliveHeader !== undefined) {
      assert.strictEqual(keepAliveHeader, "timeout="+DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT);
    }
  });

});
