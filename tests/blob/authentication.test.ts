import {
  Aborter,
  AnonymousCredential,
  ContainerURL,
  ServiceURL,
  SharedKeyCredential,
  StorageURL
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
