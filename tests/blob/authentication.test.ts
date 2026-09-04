import {
  StorageSharedKeyCredential,
  newPipeline,
  BlobServiceClient,
  AnonymousCredential
} from "@azure/storage-blob";
import * as assert from "assert";
import * as http from "http";

import { computeHMACSHA256 } from "../../src/common/utils/utils";
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

  // Regression test for https://github.com/Azure/Azurite/issues/1385
  // Azure Storage ignores the `Date` header when `x-ms-date` is present and
  // signs Blob/Queue SharedKey with an EMPTY Date field (x-ms-date is carried
  // in the canonicalized headers). Azurite must match, otherwise SharedKey
  // auth fails whenever a client (or proxy) also sends a `Date` header.
  it(`Should authenticate SharedKey when both Date and x-ms-date headers are present @loki @sql`, async () => {
    const account = EMULATOR_ACCOUNT_NAME;
    const key = Buffer.from(EMULATOR_ACCOUNT_KEY, "base64");
    const apiVersion = "2025-11-05";
    const dateValue = new Date().toUTCString();
    const containerName = getUniqueName("bothdatescontainer");

    // StringToSign built exactly as Azure/Azurite do for Blob SharedKey, with
    // an EMPTY Date field because x-ms-date is present.
    const stringToSign =
      [
        "PUT", // VERB
        "", // Content-Encoding
        "", // Content-Language
        "", // Content-Length ("0" is normalized to "")
        "", // Content-MD5
        "", // Content-Type
        "", // Date -> empty because x-ms-date is present
        "", // If-Modified-Since
        "", // If-Match
        "", // If-None-Match
        "", // If-Unmodified-Since
        "" // Range
      ].join("\n") +
      "\n" +
      `x-ms-date:${dateValue}\nx-ms-version:${apiVersion}\n` +
      // The emulator canonicalized resource repeats the account name.
      `/${account}/${account}/${containerName}\nrestype:container`;

    const signature = computeHMACSHA256(stringToSign, key);

    const statusCode = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          host: server.config.host,
          port: server.config.port,
          method: "PUT",
          path: `/${account}/${containerName}?restype=container`,
          headers: {
            "x-ms-date": dateValue,
            date: dateValue, // both headers present - the #1385 repro
            "x-ms-version": apiVersion,
            "content-length": "0",
            authorization: `SharedKey ${account}:${signature}`
          }
        },
        (res) => {
          res.on("data", () => {
            /* drain */
          });
          res.on("end", () => resolve(res.statusCode || 0));
        }
      );
      req.on("error", reject);
      req.end();
    });

    assert.strictEqual(
      statusCode,
      201,
      `Expected container create to succeed (201) with both Date and x-ms-date headers, got ${statusCode}`
    );

    // Best-effort cleanup to keep per-test state isolated.
    try {
      const cleanupClient = new BlobServiceClient(
        baseURL,
        newPipeline(
          new StorageSharedKeyCredential(
            EMULATOR_ACCOUNT_NAME,
            EMULATOR_ACCOUNT_KEY
          ),
          {
            retryOptions: { maxTries: 1 },
            keepAliveOptions: { enable: false }
          }
        )
      );
      await cleanupClient.getContainerClient(containerName).delete();
    } catch (error) {
      /* Noop */
    }
  });
});
