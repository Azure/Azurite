import * as assert from "assert";

import {
  Aborter,
  AnonymousCredential,
  ContainerURL,
  ServiceURL,
  SharedKeyCredential,
  StorageURL
} from "@azure/storage-blob";

import BlobConfiguration from "../../src/blob/BlobConfiguration";
import Server from "../../src/blob/BlobServer";
import { configLogger } from "../../src/common/Logger";
import { StoreDestinationArray } from "../../src/common/persistence/IExtentStore";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  rmRecursive
} from "../testutils";

// Set true to enable debug log
configLogger(false);

describe("Authentication", () => {
  // TODO: Create a server factory as tests utils
  const host = "127.0.0.1";
  const port = 11000;
  const metadataDbPath = "__blobTestsStorage__";
  const extentDbPath = "__blobExtentTestsStorage__";
  const persistencePath = "__blobTestsPersistence__";
  const DEFUALT_QUEUE_PERSISTENCE_ARRAY: StoreDestinationArray = [
    {
      persistencyId: "blobTest",
      persistencyPath: persistencePath,
      maxConcurrency: 10
    }
  ];
  const config = new BlobConfiguration(
    host,
    port,
    metadataDbPath,
    extentDbPath,
    DEFUALT_QUEUE_PERSISTENCE_ARRAY,
    false
  );

  // TODO: Create serviceURL factory as tests utils
  const baseURL = `http://${host}:${port}/devstoreaccount1`;

  let server: Server;

  before(async () => {
    server = new Server(config);
    await server.start();
  });

  after(async () => {
    await server.close();
    await rmRecursive(metadataDbPath);
    await rmRecursive(extentDbPath);
    await rmRecursive(persistencePath);
  });

  it("Should not work without credential", async () => {
    const serviceURL = new ServiceURL(
      baseURL,
      StorageURL.newPipeline(new AnonymousCredential(), {
        retryOptions: { maxTries: 1 }
      })
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);

    let err;
    try {
      await containerURL.create(Aborter.none);
    } catch (error) {
      err = error;
    } finally {
      if (err === undefined) {
        try {
          await containerURL.delete(Aborter.none);
        } catch (error) {
          /* Noop */
        }
        assert.fail();
      }
    }
  });

  it("Should not work without correct account name", async () => {
    const serviceURL = new ServiceURL(
      baseURL,
      StorageURL.newPipeline(
        new SharedKeyCredential("invalid", EMULATOR_ACCOUNT_KEY),
        {
          retryOptions: { maxTries: 1 }
        }
      )
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);

    let err;
    try {
      await containerURL.create(Aborter.none);
    } catch (error) {
      err = error;
    } finally {
      if (err === undefined) {
        try {
          await containerURL.delete(Aborter.none);
        } catch (error) {
          /* Noop */
        }
        assert.fail();
      }
    }
  });

  it("Should not work without correct account key", async () => {
    const serviceURL = new ServiceURL(
      baseURL,
      StorageURL.newPipeline(
        new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, "invalidkey"),
        {
          retryOptions: { maxTries: 1 }
        }
      )
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);

    let err;
    try {
      await containerURL.create(Aborter.none);
    } catch (error) {
      err = error;
    } finally {
      if (err === undefined) {
        try {
          await containerURL.delete(Aborter.none);
        } catch (error) {
          /* Noop */
        }
        assert.fail();
      }
    }
  });

  it("Should work with correct shared key", async () => {
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
