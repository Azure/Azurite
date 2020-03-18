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

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  [{ serverType: "http" }, { serverType: "https" }].forEach(async test => {
    const baseURL = `${test.serverType}://${server.config.host}:${server.config.port}/devstoreaccount1`;
    it(`Should not work without credential @loki @sql when using ${test.serverType}`, async () => {
      const serviceURL = new ServiceURL(
        baseURL,
        StorageURL.newPipeline(new AnonymousCredential(), {
          retryOptions: { maxTries: 1 }
        })
      );

      const containerName: string = getUniqueName("1container-with-dash");
      const containerURL = ContainerURL.fromServiceURL(
        serviceURL,
        containerName
      );

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

    it(`Should not work without correct account name @loki @sql when using ${test.serverType}`, async () => {
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
      const containerURL = ContainerURL.fromServiceURL(
        serviceURL,
        containerName
      );

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

    it(`Should not work without correct account key @loki @sql when using ${test.serverType}`, async () => {
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
      const containerURL = ContainerURL.fromServiceURL(
        serviceURL,
        containerName
      );

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

    /**
     * Exclude this test temporary since we can't make this pass for https with t1 storage sdk.
     * Will add back while migrate tests to t2 storage sdk.
     */
    if (test.serverType != "http") {
      it(`Should work with correct shared key @loki @sql when using ${test.serverType}`, async () => {
        const serviceURL = new ServiceURL(
          baseURL,
          StorageURL.newPipeline(
            new SharedKeyCredential(
              EMULATOR_ACCOUNT_NAME,
              EMULATOR_ACCOUNT_KEY
            ),
            {
              retryOptions: { maxTries: 1 }
            }
          )
        );

        const containerName: string = getUniqueName("1container-with-dash");
        const containerURL = ContainerURL.fromServiceURL(
          serviceURL,
          containerName
        );

        await containerURL.create(Aborter.none);
        await containerURL.delete(Aborter.none);
      });
    }
  });
});
