import {
  DataLakeServiceClient,
  newPipeline,
  StorageSharedKeyCredential
} from "@azure/storage-file-datalake";

import { configLogger } from "../../src/common/Logger";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../testutils";
import BlobTestServerFactory from "../BlobTestServerFactory";

// Set true to enable debug log
configLogger(false);

describe("Blob HTTPS", () => {
  const factory = new BlobTestServerFactory(true);
  const server = factory.createServer(false, false, true);
  const baseURL = `https://${server.config.host}:${server.config.port}/devstoreaccount1`;

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  it(`Should work with correct shared key using HTTPS endpoint @loki @sql`, async () => {
    const serviceClient = new DataLakeServiceClient(
      baseURL,
      newPipeline(
        new StorageSharedKeyCredential(
          EMULATOR_ACCOUNT_NAME,
          EMULATOR_ACCOUNT_KEY
        ),
        {
          retryOptions: { maxTries: 1 },
          // Make sure socket is closed once the operation is done.
          keepAliveOptions: { enable: false }
        }
      )
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerClient = serviceClient.getFileSystemClient(containerName);

    await containerClient.create();
    await containerClient.delete();
  });
});
