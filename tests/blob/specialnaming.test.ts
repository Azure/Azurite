import dns = require("dns");

import {
  BlobServiceClient,
  newPipeline,
  StorageSharedKeyCredential,
  BlockBlobClient
} from "@azure/storage-blob";
import assert = require("assert");

import { configLogger } from "../../src/common/Logger";
import BlobTestServerFactory from "../BlobTestServerFactory";
import {
  appendToURLPath,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../testutils";

// Set true to enable debug log
configLogger(false);

describe("SpecialNaming", () => {
  const factory = new BlobTestServerFactory();
  const server = factory.createServer();

  const baseURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1`;
  const baseSecondaryURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1-secondary`;
  const productionStyleHostName = "devstoreaccount1.blob.localhost"; // Use hosts file to make this resolve
  const productionStyleHostNameForSecondary = "devstoreaccount1-secondary.blob.localhost";
  const noAccountHostName = "host.docker.internal";
  const noAccountHostNameConnectionString = `DefaultEndpointsProtocol=http;AccountName=${EMULATOR_ACCOUNT_NAME};AccountKey=${EMULATOR_ACCOUNT_KEY};BlobEndpoint=http://${noAccountHostName}:${server.config.port}/${EMULATOR_ACCOUNT_NAME};`;

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

  before(async () => {
    await server.start();
    await containerClient.create();
  });

  after(async () => {
    await containerClient.delete();
    await server.close();
    await server.clean();
  });

  it("Should work with special container and blob names with spaces @loki @sql", async () => {
    const blobName: string = getUniqueName("blob empty");
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.upload("A", 1);
    const response = (
      await containerClient
        .listBlobsByHierarchy("$", {
          prefix: blobName
        })
        .byPage()
        .next()
    ).value;
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special container and blob names with unicode @loki @sql", async () => {
    const blobName: string = getUniqueName("unicod\u00e9");
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.upload("A", 1);
    const response = (
      await containerClient
        .listBlobsByHierarchy("$", {
          prefix: blobName
        })
        .byPage()
        .next()
    ).value;
    assert.notDeepEqual(response.segment.blobItems.length, 0);
    assert.deepStrictEqual(response.segment.blobItems[0].name, blobName);
  });

  it("Should work with special container and blob names with spaces in URL string @loki @sql", async () => {
    const blobName: string = getUniqueName("blob empty");
    const blockBlobClient = new BlockBlobClient(
      appendToURLPath(containerClient.url, blobName),
      (containerClient as any).pipeline
    );

    await blockBlobClient.upload("A", 1);
    const response = (
      await containerClient
        .listBlobsByHierarchy("$", {
          prefix: blobName
        })
        .byPage()
        .next()
    ).value;
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special container and blob names with / @loki @sql", async () => {
    const blobName: string = getUniqueName("////blob/empty /another");
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.upload("A", 1);
    await blockBlobClient.getProperties();
    const response = (
      await containerClient
        .listBlobsByHierarchy("$", {
          prefix: blobName
        })
        .byPage()
        .next()
    ).value;
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special container and blob names with / in URL string @loki @sql", async () => {
    const blobName: string = getUniqueName("////blob/empty /another");
    const blockBlobClient = new BlockBlobClient(
      appendToURLPath(containerClient.url, blobName),
      (containerClient as any).pipeline
    );

    await blockBlobClient.upload("A", 1);
    await blockBlobClient.getProperties();
    const response = (
      await containerClient
        .listBlobsByHierarchy("$", {
          prefix: blobName
        })
        .byPage()
        .next()
    ).value;
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special container and blob names uppercase @loki @sql", async () => {
    const blobName: string = getUniqueName("////Upper/blob/empty /another");
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.upload("A", 1);
    await blockBlobClient.getProperties();
    const response = (
      await containerClient
        .listBlobsByHierarchy("$", {
          prefix: blobName
        })
        .byPage()
        .next()
    ).value;
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special container and blob names uppercase in URL string @loki @sql", async () => {
    const blobName: string = getUniqueName("////Upper/blob/empty /another");
    const blockBlobClient = new BlockBlobClient(
      appendToURLPath(containerClient.url, blobName),
      (containerClient as any).pipeline
    );

    await blockBlobClient.upload("A", 1);
    await blockBlobClient.getProperties();
    const response = (
      await containerClient
        .listBlobsByHierarchy("$", {
          prefix: blobName
        })
        .byPage()
        .next()
    ).value;
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob names Chinese characters @loki @sql", async () => {
    const blobName: string = getUniqueName(
      "////Upper/blob/empty /another 汉字"
    );
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.upload("A", 1);
    await blockBlobClient.getProperties();
    const response = (
      await containerClient
        .listBlobsByHierarchy("$", {
          prefix: blobName
        })
        .byPage()
        .next()
    ).value;
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob names Chinese characters in URL string @loki @sql", async () => {
    const blobName: string = getUniqueName(
      "////Upper/blob/empty /another 汉字"
    );
    const blockBlobClient = new BlockBlobClient(
      appendToURLPath(containerClient.url, blobName),
      (containerClient as any).pipeline
    );

    await blockBlobClient.upload("A", 1);
    await blockBlobClient.getProperties();
    const response = (
      await containerClient
        .listBlobsByHierarchy("$", {
          prefix: blobName
        })
        .byPage()
        .next()
    ).value;
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob name characters @loki @sql", async () => {
    const blobName: string = getUniqueName(
      "汉字. special ~!@#$%^&*()_+`1234567890-={}|[]\\:\";'<>?,/'"
    );
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.upload("A", 1);
    await blockBlobClient.getProperties();
    const response = (
      await containerClient
        .listBlobsByHierarchy(
          "b", // A char doesn't exist in blob name
          {
            // NOTICE: Azure Storage Server will replace "\" with "/" in the blob names
            prefix: blobName.replace(/\\/g, "/")
          }
        )
        .byPage()
        .next()
    ).value;
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob name characters in URL string @loki @sql", async () => {
    const blobName: string = getUniqueName(
      "汉字. special ~!@#$%^&*()_+`1234567890-={}|[]\\:\";'<>?,/'"
    );
    const blockBlobClient = new BlockBlobClient(
      // There are 2 special cases for a URL string:
      // Escape "%" when creating XXXURL object with URL strings
      // Escape "?" otherwise string after "?" will be treated as URL parameters
      appendToURLPath(
        containerClient.url,
        blobName.replace(/%/g, "%25").replace(/\?/g, "%3F")
      ),
      (containerClient as any).pipeline
    );

    await blockBlobClient.upload("A", 1);
    await blockBlobClient.getProperties();
    const response = (
      await containerClient
        .listBlobsByHierarchy(
          "b", // "b" doesn't exist in blob name
          {
            // NOTICE: Azure Storage Server will replace "\" with "/" in the blob names
            prefix: blobName.replace(/\\/g, "/")
          }
        )
        .byPage()
        .next()
    ).value;
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob name Russian URI encoded @loki @sql", async () => {
    const blobName: string = getUniqueName("ру́сский язы́к");
    const blobNameEncoded: string = encodeURIComponent(blobName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobNameEncoded);

    await blockBlobClient.upload("A", 1);
    await blockBlobClient.getProperties();
    const response = (
      await containerClient
        .listBlobsByHierarchy("$", {
          prefix: blobNameEncoded
        })
        .byPage()
        .next()
    ).value;
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob name Russian @loki @sql", async () => {
    const blobName: string = getUniqueName("ру́сский язы́к");
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.upload("A", 1);
    await blockBlobClient.getProperties();
    const response = (
      await containerClient
        .listBlobsByHierarchy("$", {
          prefix: blobName
        })
        .byPage()
        .next()
    ).value;
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob name Russian in URL string @loki @sql", async () => {
    const blobName: string = getUniqueName("ру́сский язы́к");
    const blockBlobClient = new BlockBlobClient(
      appendToURLPath(containerClient.url, blobName),
      (containerClient as any).pipeline
    );

    await blockBlobClient.upload("A", 1);
    await blockBlobClient.getProperties();
    const response = (
      await containerClient
        .listBlobsByHierarchy("$", {
          prefix: blobName
        })
        .byPage()
        .next()
    ).value;
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob name Arabic URI encoded @loki @sql", async () => {
    const blobName: string = getUniqueName("عربي/عربى");
    const blobNameEncoded: string = encodeURIComponent(blobName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobNameEncoded);

    await blockBlobClient.upload("A", 1);
    await blockBlobClient.getProperties();
    const response = (
      await containerClient
        .listBlobsByHierarchy("$", {
          prefix: blobNameEncoded
        })
        .byPage()
        .next()
    ).value;
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob name Arabic @loki @sql", async () => {
    const blobName: string = getUniqueName("عربي/عربى");
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.upload("A", 1);
    await blockBlobClient.getProperties();
    const response = (
      await containerClient
        .listBlobsByHierarchy("$", {
          prefix: blobName
        })
        .byPage()
        .next()
    ).value;
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob name Arabic in URL string @loki @sql", async () => {
    const blobName: string = getUniqueName("عربي/عربى");
    const blockBlobClient = new BlockBlobClient(
      appendToURLPath(containerClient.url, blobName),
      (containerClient as any).pipeline
    );

    await blockBlobClient.upload("A", 1);
    await blockBlobClient.getProperties();
    const response = (
      await containerClient
        .listBlobsByHierarchy("$", {
          prefix: blobName
        })
        .byPage()
        .next()
    ).value;
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob name Japanese URI encoded @loki @sql", async () => {
    const blobName: string = getUniqueName("にっぽんご/にほんご");
    const blobNameEncoded: string = encodeURIComponent(blobName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobNameEncoded);

    await blockBlobClient.upload("A", 1);
    await blockBlobClient.getProperties();
    const response = (
      await containerClient
        .listBlobsByHierarchy("$", {
          prefix: blobNameEncoded
        })
        .byPage()
        .next()
    ).value;
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob name Japanese @loki @sql", async () => {
    const blobName: string = getUniqueName("にっぽんご/にほんご");
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.upload("A", 1);
    await blockBlobClient.getProperties();
    const response = (
      await containerClient
        .listBlobsByHierarchy("$", {
          prefix: blobName
        })
        .byPage()
        .next()
    ).value;
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob name Japanese in URL string @loki @sql", async () => {
    const blobName: string = getUniqueName("にっぽんご/にほんご");
    const blockBlobClient = new BlockBlobClient(
      appendToURLPath(containerClient.url, blobName),
      (containerClient as any).pipeline
    );

    await blockBlobClient.upload("A", 1);
    await blockBlobClient.getProperties();
    const response = (
      await containerClient
        .listBlobsByHierarchy("$", {
          prefix: blobName
        })
        .byPage()
        .next()
    ).value;
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it(`Should work with production style URL when ${productionStyleHostName} is resolvable`, async () => {
    await dns.promises.lookup(productionStyleHostName).then(
      async (lookupAddress) => {
        const baseURLProductionStyle = `http://${productionStyleHostName}:${server.config.port}`;
        const serviceClientProductionStyle = new BlobServiceClient(
          baseURLProductionStyle,
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
        const containerClientProductionStyle = serviceClientProductionStyle.getContainerClient(
          containerName
        );

        const blobName: string = getUniqueName("myblob");
        const blockBlobClient = containerClientProductionStyle.getBlockBlobClient(
          blobName
        );

        await blockBlobClient.upload("ABC", 3);
        const response = (
          await containerClientProductionStyle
            .listBlobsByHierarchy("$", {
              prefix: blobName
            })
            .byPage()
            .next()
        ).value;
        assert.notDeepEqual(response.segment.blobItems.length, 0);
      },
      () => {
        // Cannot perform this test. We need devstoreaccount1.localhost to resolve to 127.0.0.1.
        // On Linux, this should just work,
        // On Windows, we can't spoof DNS record for specific process.
        // So we have options of running our own DNS server (overkill),
        // or editing hosts files (machine global operation; and requires running as admin).
        // So skip the test case.
        assert.ok(
          `Skipping test case - it needs ${productionStyleHostName} to be resolvable`
        );
      }
    );
  });

  it(`Should work with no account host name URL when ${noAccountHostName} is resolvable`, async () => {
    await dns.promises.lookup(noAccountHostName).then(
      async (lookupAddress) => {
        const serviceClientNoHostName = BlobServiceClient.fromConnectionString(
          noAccountHostNameConnectionString,
          {
            retryOptions: { maxTries: 1 },
            // Make sure socket is closed once the operation is done.
            keepAliveOptions: { enable: false }
          }
        );
        const containerClientProductionStyle = serviceClientNoHostName.getContainerClient(
          containerName
        );

        const blobName: string = getUniqueName("myblob");
        const blockBlobClient = containerClientProductionStyle.getBlockBlobClient(
          blobName
        );

        await blockBlobClient.upload("ABC", 3);
        const response = (
          await containerClientProductionStyle
            .listBlobsByHierarchy("$", {
              prefix: blobName
            })
            .byPage()
            .next()
        ).value;
        assert.notDeepEqual(response.segment.blobItems.length, 0);
      },
      () => {
        // Cannot perform this test. We need host.docker.internal to resolve to 127.0.0.1.
        // On Windows, we can't spoof DNS record for specific process.
        // So we have options of running our own DNS server (overkill),
        // or editing hosts files (machine global operation; and requires running as admin).
        // So skip the test case.
        assert.ok(
          `Skipping test case - it needs ${noAccountHostName} to be resolvable`
        );
      }
    );
  });

  it(`Should work with production style URL when ${productionStyleHostNameForSecondary} is resolvable`, async () => {
    await dns.promises.lookup(productionStyleHostNameForSecondary).then(
      async (lookupAddress) => {
        const baseURLProductionStyle = `http://${productionStyleHostNameForSecondary}:${server.config.port}`;
        const serviceClientProductionStyle = new BlobServiceClient(
          baseURLProductionStyle,
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
        const containerClientProductionStyle = serviceClientProductionStyle.getContainerClient(
          containerName
        );

        const response =
          await containerClientProductionStyle.getProperties();

        assert.deepStrictEqual(response._response.status, 200);
      },
      () => {
        // Cannot perform this test. We need devstoreaccount1-secondary.blob.localhost to resolve to 127.0.0.1.
        // On Linux, this should just work,
        // On Windows, we can't spoof DNS record for specific process.
        // So we have options of running our own DNS server (overkill),
        // or editing hosts files (machine global operation; and requires running as admin).
        // So skip the test case.
        assert.ok(
          `Skipping test case - it needs ${productionStyleHostNameForSecondary} to be resolvable`
        );
      }
    );
  });

  it(`Should work with non-production secondary url when ${baseSecondaryURL} is resolvable`, async () => {
    const secondaryServiceClient = new BlobServiceClient(
      baseSecondaryURL,
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
    const containerClientSecondary = secondaryServiceClient.getContainerClient(
      getUniqueName("container")
    );
    
    const response = await containerClientSecondary.createIfNotExists();
    assert.deepStrictEqual(response._response.status, 201);
  });
});
