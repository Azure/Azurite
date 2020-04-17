import {
  Aborter,
  ContainerURL,
  ServiceURL,
  SharedKeyCredential,
  StorageURL
} from "@azure/storage-blob";

import { configLogger } from "../../src/common/Logger";
import BlobTestServerFactory from "../BlobTestServerFactory";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../testutils";

// Set true to enable debug log
configLogger(false);

describe("Blob HTTPS", () => {
  const factory = new BlobTestServerFactory();
  const server = factory.createServer(false, true);
  const baseURL = `https://${server.config.host}:${server.config.port}/devstoreaccount1`;

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  it(`Should work with correct shared key using HTTPS endpoint @loki @sql`, async () => {
    const serviceURL = new ServiceURL(
      baseURL,
      StorageURL.newPipeline(
        new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
        {
          retryOptions: { maxTries: 1 }
        }
      )
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);

    await containerURL.create(Aborter.none);
    await containerURL.delete(Aborter.none);
  });
});
