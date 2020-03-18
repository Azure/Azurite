import dns = require("dns");

import {
  Aborter,
  BlockBlobURL,
  ContainerURL,
  ServiceURL,
  SharedKeyCredential,
  StorageURL
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
  const productionStyleHostName = "devstoreaccount1.localhost"; // Use hosts file to make this resolve

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

  before(async () => {
    await server.start();
    await containerURL.create(Aborter.none);
  });

  after(async () => {
    await containerURL.delete(Aborter.none);
    await server.close();
    await server.clean();
  });

  it("Should work with special container and blob names with spaces @loki @sql", async () => {
    const blobName: string = getUniqueName("blob empty");
    const blockBlobURL = BlockBlobURL.fromContainerURL(containerURL, blobName);

    await blockBlobURL.upload(Aborter.none, "A", 1);
    const response = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      "$",
      undefined,
      {
        prefix: blobName
      }
    );
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special container and blob names with unicode @loki @sql", async () => {
    const blobName: string = getUniqueName("unicod\u00e9");
    const blockBlobURL = BlockBlobURL.fromContainerURL(containerURL, blobName);

    await blockBlobURL.upload(Aborter.none, "A", 1);
    const response = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      "$",
      undefined,
      {
        prefix: blobName
      }
    );
    assert.notDeepEqual(response.segment.blobItems.length, 0);
    assert.deepStrictEqual(response.segment.blobItems[0].name, blobName);
  });

  it("Should work with special container and blob names with spaces in URL string @loki @sql", async () => {
    const blobName: string = getUniqueName("blob empty");
    const blockBlobURL = new BlockBlobURL(
      appendToURLPath(containerURL.url, blobName),
      containerURL.pipeline
    );

    await blockBlobURL.upload(Aborter.none, "A", 1);
    const response = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      "$",
      undefined,
      {
        prefix: blobName
      }
    );
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special container and blob names with / @loki @sql", async () => {
    const blobName: string = getUniqueName("////blob/empty /another");
    const blockBlobURL = BlockBlobURL.fromContainerURL(containerURL, blobName);

    await blockBlobURL.upload(Aborter.none, "A", 1);
    await blockBlobURL.getProperties(Aborter.none);
    const response = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      "$",
      undefined,
      {
        prefix: blobName
      }
    );
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special container and blob names with / in URL string @loki @sql", async () => {
    const blobName: string = getUniqueName("////blob/empty /another");
    const blockBlobURL = new BlockBlobURL(
      appendToURLPath(containerURL.url, blobName),
      containerURL.pipeline
    );

    await blockBlobURL.upload(Aborter.none, "A", 1);
    await blockBlobURL.getProperties(Aborter.none);
    const response = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      "$",
      undefined,
      {
        prefix: blobName
      }
    );
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special container and blob names uppercase @loki @sql", async () => {
    const blobName: string = getUniqueName("////Upper/blob/empty /another");
    const blockBlobURL = BlockBlobURL.fromContainerURL(containerURL, blobName);

    await blockBlobURL.upload(Aborter.none, "A", 1);
    await blockBlobURL.getProperties(Aborter.none);
    const response = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      "$",
      undefined,
      {
        prefix: blobName
      }
    );
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special container and blob names uppercase in URL string @loki @sql", async () => {
    const blobName: string = getUniqueName("////Upper/blob/empty /another");
    const blockBlobURL = new BlockBlobURL(
      appendToURLPath(containerURL.url, blobName),
      containerURL.pipeline
    );

    await blockBlobURL.upload(Aborter.none, "A", 1);
    await blockBlobURL.getProperties(Aborter.none);
    const response = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      "$",
      undefined,
      {
        prefix: blobName
      }
    );
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob names Chinese characters @loki @sql", async () => {
    const blobName: string = getUniqueName(
      "////Upper/blob/empty /another 汉字"
    );
    const blockBlobURL = BlockBlobURL.fromContainerURL(containerURL, blobName);

    await blockBlobURL.upload(Aborter.none, "A", 1);
    await blockBlobURL.getProperties(Aborter.none);
    const response = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      "$",
      undefined,
      {
        prefix: blobName
      }
    );
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob names Chinese characters in URL string @loki @sql", async () => {
    const blobName: string = getUniqueName(
      "////Upper/blob/empty /another 汉字"
    );
    const blockBlobURL = new BlockBlobURL(
      appendToURLPath(containerURL.url, blobName),
      containerURL.pipeline
    );

    await blockBlobURL.upload(Aborter.none, "A", 1);
    await blockBlobURL.getProperties(Aborter.none);
    const response = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      "$",
      undefined,
      {
        prefix: blobName
      }
    );
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob name characters @loki @sql", async () => {
    const blobName: string = getUniqueName(
      "汉字. special ~!@#$%^&*()_+`1234567890-={}|[]\\:\";'<>?,/'"
    );
    const blockBlobURL = BlockBlobURL.fromContainerURL(containerURL, blobName);

    await blockBlobURL.upload(Aborter.none, "A", 1);
    await blockBlobURL.getProperties(Aborter.none);
    const response = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      "b", // A char doesn't exist in blob name
      undefined,
      {
        // NOTICE: Azure Storage Server will replace "\" with "/" in the blob names
        prefix: blobName.replace(/\\/g, "/")
      }
    );
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob name characters in URL string @loki @sql", async () => {
    const blobName: string = getUniqueName(
      "汉字. special ~!@#$%^&*()_+`1234567890-={}|[]\\:\";'<>?,/'"
    );
    const blockBlobURL = new BlockBlobURL(
      // There are 2 special cases for a URL string:
      // Escape "%" when creating XXXURL object with URL strings
      // Escape "?" otherwise string after "?" will be treated as URL parameters
      appendToURLPath(
        containerURL.url,
        blobName.replace(/%/g, "%25").replace(/\?/g, "%3F")
      ),
      containerURL.pipeline
    );

    await blockBlobURL.upload(Aborter.none, "A", 1);
    await blockBlobURL.getProperties(Aborter.none);
    const response = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      "b", // "b" doesn't exist in blob name
      undefined,
      {
        // NOTICE: Azure Storage Server will replace "\" with "/" in the blob names
        prefix: blobName.replace(/\\/g, "/")
      }
    );
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob name Russian URI encoded @loki @sql", async () => {
    const blobName: string = getUniqueName("ру́сский язы́к");
    const blobNameEncoded: string = encodeURIComponent(blobName);
    const blockBlobURL = BlockBlobURL.fromContainerURL(
      containerURL,
      blobNameEncoded
    );

    await blockBlobURL.upload(Aborter.none, "A", 1);
    await blockBlobURL.getProperties(Aborter.none);
    const response = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      "$",
      undefined,
      {
        prefix: blobNameEncoded
      }
    );
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob name Russian @loki @sql", async () => {
    const blobName: string = getUniqueName("ру́сский язы́к");
    const blockBlobURL = BlockBlobURL.fromContainerURL(containerURL, blobName);

    await blockBlobURL.upload(Aborter.none, "A", 1);
    await blockBlobURL.getProperties(Aborter.none);
    const response = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      "$",
      undefined,
      {
        prefix: blobName
      }
    );
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob name Russian in URL string @loki @sql", async () => {
    const blobName: string = getUniqueName("ру́сский язы́к");
    const blockBlobURL = new BlockBlobURL(
      appendToURLPath(containerURL.url, blobName),
      containerURL.pipeline
    );

    await blockBlobURL.upload(Aborter.none, "A", 1);
    await blockBlobURL.getProperties(Aborter.none);
    const response = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      "$",
      undefined,
      {
        prefix: blobName
      }
    );
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob name Arabic URI encoded @loki @sql", async () => {
    const blobName: string = getUniqueName("عربي/عربى");
    const blobNameEncoded: string = encodeURIComponent(blobName);
    const blockBlobURL = BlockBlobURL.fromContainerURL(
      containerURL,
      blobNameEncoded
    );

    await blockBlobURL.upload(Aborter.none, "A", 1);
    await blockBlobURL.getProperties(Aborter.none);
    const response = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      "$",
      undefined,
      {
        prefix: blobNameEncoded
      }
    );
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob name Arabic @loki @sql", async () => {
    const blobName: string = getUniqueName("عربي/عربى");
    const blockBlobURL = BlockBlobURL.fromContainerURL(containerURL, blobName);

    await blockBlobURL.upload(Aborter.none, "A", 1);
    await blockBlobURL.getProperties(Aborter.none);
    const response = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      "$",
      undefined,
      {
        prefix: blobName
      }
    );
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob name Arabic in URL string @loki @sql", async () => {
    const blobName: string = getUniqueName("عربي/عربى");
    const blockBlobURL = new BlockBlobURL(
      appendToURLPath(containerURL.url, blobName),
      containerURL.pipeline
    );

    await blockBlobURL.upload(Aborter.none, "A", 1);
    await blockBlobURL.getProperties(Aborter.none);
    const response = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      "$",
      undefined,
      {
        prefix: blobName
      }
    );
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob name Japanese URI encoded @loki @sql", async () => {
    const blobName: string = getUniqueName("にっぽんご/にほんご");
    const blobNameEncoded: string = encodeURIComponent(blobName);
    const blockBlobURL = BlockBlobURL.fromContainerURL(
      containerURL,
      blobNameEncoded
    );

    await blockBlobURL.upload(Aborter.none, "A", 1);
    await blockBlobURL.getProperties(Aborter.none);
    const response = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      "$",
      undefined,
      {
        prefix: blobNameEncoded
      }
    );
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob name Japanese @loki @sql", async () => {
    const blobName: string = getUniqueName("にっぽんご/にほんご");
    const blockBlobURL = BlockBlobURL.fromContainerURL(containerURL, blobName);

    await blockBlobURL.upload(Aborter.none, "A", 1);
    await blockBlobURL.getProperties(Aborter.none);
    const response = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      "$",
      undefined,
      {
        prefix: blobName
      }
    );
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it("Should work with special blob name Japanese in URL string @loki @sql", async () => {
    const blobName: string = getUniqueName("にっぽんご/にほんご");
    const blockBlobURL = new BlockBlobURL(
      appendToURLPath(containerURL.url, blobName),
      containerURL.pipeline
    );

    await blockBlobURL.upload(Aborter.none, "A", 1);
    await blockBlobURL.getProperties(Aborter.none);
    const response = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      "$",
      undefined,
      {
        prefix: blobName
      }
    );
    assert.notDeepEqual(response.segment.blobItems.length, 0);
  });

  it(`Should work with production style URL when ${productionStyleHostName} is resolvable`, async () => {
    await dns.promises.lookup(productionStyleHostName).then(
      async lookupAddress => {
        const baseURLProductionStyle = `http://${productionStyleHostName}:${server.config.port}`;
        const serviceURLProductionStyle = new ServiceURL(
          baseURLProductionStyle,
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
        const containerURLProductionStyle = ContainerURL.fromServiceURL(
          serviceURLProductionStyle,
          containerName
        );

        const blobName: string = getUniqueName("myblob");
        const blockBlobURL = BlockBlobURL.fromContainerURL(
          containerURLProductionStyle,
          blobName
        );

        await blockBlobURL.upload(Aborter.none, "ABC", 3);
        const response = await containerURLProductionStyle.listBlobHierarchySegment(
          Aborter.none,
          "$",
          undefined,
          {
            prefix: blobName
          }
        );
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
});
