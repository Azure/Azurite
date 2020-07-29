import {
  StorageSharedKeyCredential,
  newPipeline,
  BlobServiceClient,
  AnonymousCredential
} from "@azure/storage-blob";
import * as assert from "assert";

import { configLogger } from "../../src/common/Logger";
import BlobTestServerFactory from "../BlobTestServerFactory";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../testutils";

// Set true to enable debug log
configLogger(false);

describe("Authentication", () => {
  const factory = new BlobTestServerFactory();
  const server = factory.createServer();

  const baseURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1`;

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  it(`Should not work without credential @loki @sql`, async () => {
    const serviceClient = new BlobServiceClient(
      baseURL,
      newPipeline(new AnonymousCredential(), {
        retryOptions: { maxTries: 1 },
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerClient = serviceClient.getContainerClient(containerName);

    let err;
    try {
      await containerClient.create();
    } catch (error) {
      err = error;
    } finally {
      if (err === undefined) {
        try {
          await containerClient.delete();
        } catch (error) {
          /* Noop */
        }
        assert.fail();
      }
    }
  });

  it(`Should not work without correct account name @loki @sql`, async () => {
    const serviceClient = new BlobServiceClient(
      baseURL,
      newPipeline(
        new StorageSharedKeyCredential("invalid", EMULATOR_ACCOUNT_KEY),
        {
          retryOptions: { maxTries: 1 },
          // Make sure socket is closed once the operation is done.
          keepAliveOptions: { enable: false }
        }
      )
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerClient = serviceClient.getContainerClient(containerName);

    let err;
    try {
      await containerClient.create();
    } catch (error) {
      err = error;
    } finally {
      if (err === undefined) {
        try {
          await containerClient.delete();
        } catch (error) {
          /* Noop */
        }
        assert.fail();
      }
    }
  });

  it(`Should not work without correct account key @loki @sql`, async () => {
    const serviceClient = new BlobServiceClient(
      baseURL,
      newPipeline(
        new StorageSharedKeyCredential(EMULATOR_ACCOUNT_NAME, "invalidkey"),
        {
          retryOptions: { maxTries: 1 },
          // Make sure socket is closed once the operation is done.
          keepAliveOptions: { enable: false }
        }
      )
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerClient = serviceClient.getContainerClient(containerName);

    let err;
    try {
      await containerClient.create();
    } catch (error) {
      err = error;
    } finally {
      if (err === undefined) {
        try {
          await containerClient.delete();
        } catch (error) {
          /* Noop */
        }
        assert.fail();
      }
    }
  });

  it(`Should work with correct shared key @loki @sql`, async () => {
    const serviceClient = new BlobServiceClient(
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
    const containerClient = serviceClient.getContainerClient(containerName);

    await containerClient.create();
    await containerClient.delete();
  });
});
