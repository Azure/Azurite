import dns = require("dns");

import {
  DataLakeFileClient,
  DataLakeServiceClient,
  FileSystemListPathsResponse,
  newPipeline,
  StorageSharedKeyCredential
} from "@azure/storage-file-datalake";

import { configLogger } from "../../../src/common/Logger";
import {
  appendToURLPath,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../../testutils";
import DataLakeTestServerFactory from "../DataLakeTestServerFactory";

import assert = require("assert");

// Set true to enable debug log
configLogger(false);

describe("SpecialNaming", () => {
  const factory = new DataLakeTestServerFactory();
  const server = factory.createServer();

  const baseURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1`;
  const productionStyleHostName = "devstoreaccount1.localhost"; // Use hosts file to make this resolve
  const noAccountHostName = "host.docker.internal";
  const noAccountHostNameConnectionString = `DefaultEndpointsProtocol=http;AccountName=${EMULATOR_ACCOUNT_NAME};AccountKey=${EMULATOR_ACCOUNT_KEY};BlobEndpoint=http://${noAccountHostName}:${server.config.port}/${EMULATOR_ACCOUNT_NAME};`;

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

  const content = "Hello World!";
  const filesystemName: string = getUniqueName("1container-with-dash");
  const fileSystemClient = serviceClient.getFileSystemClient(filesystemName);
  const parentDirectoryClient = fileSystemClient.getDirectoryClient(
    getUniqueName("dir1")
  );
  const childDirectoryClient = parentDirectoryClient.getSubdirectoryClient(
    getUniqueName("dir2")
  );
  const directoryClient = childDirectoryClient.getSubdirectoryClient(
    getUniqueName("dir3")
  );

  before(async () => {
    await server.start();
    await fileSystemClient.create();
  });

  after(async () => {
    await fileSystemClient.delete();
    await server.close();
    await server.clean();
  });

  afterEach(async () => {
    await parentDirectoryClient.deleteIfExists(true);
  });

  async function testSpecialFile(name: string, url: boolean = false) {
    const fileName: string = getUniqueName(name);
    const fileClient = url
      ? new DataLakeFileClient(
          // There are 2 special cases for a URL string:
          // Escape "%" when creating XXXURL object with URL strings
          // Escape "?" otherwise string after "?" will be treated as URL parameters
          appendToURLPath(
            directoryClient.url,
            fileName.replace(/%/g, "%25").replace(/\?/g, "%3F")
          ),
          (directoryClient as any).pipeline
        )
      : directoryClient.getFileClient(fileName);

    await fileClient.create();
    assert.strictEqual(await parentDirectoryClient.exists(), true);
    assert.strictEqual(await childDirectoryClient.exists(), true);
    assert.strictEqual(await directoryClient.exists(), true);
    assert.strictEqual(await fileClient.exists(), true);
    await fileClient.append(content, 0, content.length, { flush: true });
    await fileClient.getProperties();
    const response: FileSystemListPathsResponse = (
      await fileSystemClient
        .listPaths({
          path: `${directoryClient.name}/`
        })
        .byPage()
        .next()
    ).value;
    assert.strictEqual(response.pathItems!.length, 1);
    assert.strictEqual(
      response.pathItems![0].name,
      `${directoryClient.name}/${fileName.replace(/\\/g, "/")}`
    );

    await parentDirectoryClient.delete(true);
    assert.strictEqual(await parentDirectoryClient.exists(), false);
    assert.strictEqual(await childDirectoryClient.exists(), false);
    assert.strictEqual(await directoryClient.exists(), false);
    assert.strictEqual(await fileClient.exists(), false);
  }

  it("Should work with special container and blob names with unicode @loki @sql", async () => {
    await testSpecialFile("unicod\u00e9");
  });

  it("Should work with special container and blob names with unicode in URL string @loki @sql", async () => {
    await testSpecialFile("unicod\u00e9", true);
  });

  it("Should work with special container and blob names with spaces @loki @sql", async () => {
    await testSpecialFile("blob empty");
  });

  it("Should work with special container and blob names with spaces in URL string @loki @sql", async () => {
    await testSpecialFile("blob empty", true);
  });

  /*******************************************************************************************************
   * "/" test cases are Invalid in DataLake since "/" denotes folder structure so can only work encoded
   * ********************************************************************************************************/

  // it("Should work with special container and blob names with / @loki @sql", async () => {
  //   await testSpecialFile("////blob/empty /another");
  // });

  // it("Should work with special container and blob names with / in URL string @loki @sql", async () => {
  //   await testSpecialFile("////blob/empty /another", true);
  // });

  it("Should work with special container and blob names uppercase @loki @sql", async () => {
    await testSpecialFile(" Upper blob empty another");
  });

  it("Should work with special container and blob names uppercase in URL string @loki @sql", async () => {
    await testSpecialFile(" Upper blob empty another", true);
  });

  it("Should work with special blob names Chinese characters @loki @sql", async () => {
    await testSpecialFile(" Upper blob empty another 汉字");
  });

  it("Should work with special blob names Chinese characters in URL string @loki @sql", async () => {
    await testSpecialFile(" Upper blob empty another 汉字", true);
  });

  it("Should work with special blob name characters @loki @sql", async () => {
    await testSpecialFile(
      "汉字. special ~!@#$%^&*()_+`1234567890-={}|[]:\";'<>?,'"
    );
  });

  it("Should work with special blob name characters in URL string @loki @sql", async () => {
    await testSpecialFile(
      "汉字. special ~!@#$%^&*()_+`1234567890-={}|[]:\";'<>?,'",
      true
    );
  });

  it("Should work with special blob name Russian URI encoded @loki @sql", async () => {
    await testSpecialFile(encodeURIComponent("ру́сский язы́к"));
  });

  it("Should work with special blob name Russian @loki @sql", async () => {
    await testSpecialFile("ру́сский язы́к");
  });

  it("Should work with special blob name Russian in URL string @loki @sql", async () => {
    await testSpecialFile("ру́сский язы́к", true);
  });

  it("Should work with special blob name Arabic URI encoded @loki @sql", async () => {
    await testSpecialFile(encodeURIComponent("عربي/عربى"));
  });

  it("Should work with special blob name Arabic @loki @sql", async () => {
    await testSpecialFile("عربي عربى");
  });

  it("Should work with special blob name Arabic in URL string @loki @sql", async () => {
    await testSpecialFile("عربي عربى", true);
  });

  it("Should work with special blob name Japanese URI encoded @loki @sql", async () => {
    await testSpecialFile(encodeURIComponent("にっぽんご/にほんご"));
  });

  it("Should work with special blob name Japanese @loki @sql", async () => {
    await testSpecialFile("にっぽんごにほんご");
  });

  it("Should work with special blob name Japanese in URL string @loki @sql", async () => {
    await testSpecialFile("にっぽんごにほんご", true);
  });

  it(`Should work with production style URL when ${productionStyleHostName} is resolvable`, async () => {
    await dns.promises.lookup(productionStyleHostName).then(
      async (lookupAddress) => {
        const baseURLProductionStyle = `http://${productionStyleHostName}:${server.config.port}/`;
        const serviceClientProductionStyle = new DataLakeServiceClient(
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
        const directoryClientProductionStyle =
          serviceClientProductionStyle.getFileSystemClient(filesystemName);

        const fileName: string = getUniqueName("myblob");
        const fileClient =
          directoryClientProductionStyle.getFileClient(fileName);

        await fileClient.create();
        await fileClient.append(content, 0, content.length, { flush: true });
        const response: FileSystemListPathsResponse = (
          await directoryClientProductionStyle.listPaths().byPage().next()
        ).value;
        assert.notDeepStrictEqual(response.pathItems!.length, 0);
        assert.deepStrictEqual(response.pathItems![0].name, fileName);
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
        const serviceClientNoHostName =
          DataLakeServiceClient.fromConnectionString(
            noAccountHostNameConnectionString,
            {
              retryOptions: { maxTries: 1 },
              // Make sure socket is closed once the operation is done.
              keepAliveOptions: { enable: false }
            }
          );
        const directoryClientProductionStyle =
          serviceClientNoHostName.getFileSystemClient(filesystemName);

        const fileName: string = getUniqueName("myblob");
        const fileClient =
          directoryClientProductionStyle.getFileClient(fileName);

        await fileClient.create();
        await fileClient.append(content, 0, content.length, { flush: true });
        const response: FileSystemListPathsResponse = (
          await directoryClientProductionStyle.listPaths().byPage().next()
        ).value;
        assert.notDeepStrictEqual(response.pathItems!.length, 0);
        assert.deepStrictEqual(response.pathItems![0].name, fileName);
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
});
