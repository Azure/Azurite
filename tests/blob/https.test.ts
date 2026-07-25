import {
  BlobSASPermissions,
  BlobServiceClient,
  newPipeline,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import * as assert from "assert";

import { configLogger } from "../../src/common/Logger";
import BlobTestServerFactory from "../BlobTestServerFactory";
import {
  base64encode,
  bodyToString,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../testutils";

// Set true to enable debug log
configLogger(false);

describe("Blob HTTPS", () => {
  const factory = new BlobTestServerFactory();
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

  it(`stageBlockFromURL should work using HTTPS endpoint @loki @sql`, async () => {
    // stageBlockFromURL fetches the copy source from this same server, so on
    // an HTTPS endpoint that self-request is itself HTTPS. This pins that the
    // scheme is derived from the incoming socket and that the self-request
    // succeeds against the certificate Azurite was started with.
    //
    // Note: the npm test scripts set NODE_TLS_REJECT_UNAUTHORIZED=0, which
    // disables certificate verification process-wide, so this test cannot
    // detect a regression in the self-request's own TLS handling - it would
    // pass even if that request rejected Azurite's self-signed certificate.
    // Verifying that requires running the server as a separate process
    // without the variable set.
    const serviceClient = new BlobServiceClient(
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

    const containerClient = serviceClient.getContainerClient(
      getUniqueName("container")
    );
    await containerClient.create();

    const content = "HelloWorldFromSourceBlob";
    const sourceClient = containerClient.getBlockBlobClient(
      getUniqueName("source")
    );
    await sourceClient.upload(content, content.length);
    const sourceUrl = await sourceClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    });

    const targetClient = containerClient.getBlockBlobClient(
      getUniqueName("target")
    );
    await targetClient.stageBlockFromURL(
      base64encode("1"),
      sourceUrl,
      0,
      content.length
    );
    await targetClient.commitBlockList([base64encode("1")]);

    const result = await targetClient.download(0);
    assert.deepStrictEqual(
      await bodyToString(result, content.length),
      content
    );

    await containerClient.delete();
  });
});
