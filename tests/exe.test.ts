// run "EXE Mocha TS File - Loki" in VS Code to run this test
import * as assert from "assert";
import * as Azure from "azure-storage";
import { execFile } from "child_process";
import find from "find-process";

import {
  BlobServiceClient,
  newPipeline as blobNewPipeline,
  StorageSharedKeyCredential as blobStorageSharedKeyCredential
} from "@azure/storage-blob";
import {
  newPipeline as queueNewPipeline,
  QueueClient,
  QueueServiceClient,
  StorageSharedKeyCredential as queueStorageSharedKeyCredential
} from "@azure/storage-queue";

import { configLogger } from "../src/common/Logger";
import {
  HeaderConstants,
  TABLE_API_VERSION
} from "../src/table/utils/constants";
import BlobTestServerFactory from "./BlobTestServerFactory";
import {
  createConnectionStringForTest,
  HOST,
  PORT,
  PROTOCOL
} from "./table/utils/table.entity.test.utils";
import {
  bodyToString,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  overrideRequest,
  restoreBuildRequestOptions
} from "./testutils";
import { existsSync } from "fs";

// server address used for testing. Note that Azurite.exe has
// server address of http://127.0.0.1:10000 and so on by default
// and we need to configure them when starting azurite.exe
const blobAddress = "http://127.0.0.1:11000";
const queueAddress = "http://127.0.0.1:11001";
const tableAddress = "http://127.0.0.1:11002";

// Set true to enable debug log
configLogger(false);
// For convenience, we have a switch to control the use
// of a local Azurite instance, otherwise we need an
// ENV VAR called AZURE_TABLE_STORAGE added to mocha
// script or launch.json containing
// Azure Storage Connection String (using SAS or Key).
const testLocalAzuriteInstance = true;

const binaryPath = ".\\release\\azurite.exe"

function throwOnMissingBinary() {
  if (!existsSync(binaryPath)) {
    throw new Error("The Windows binary does not exist. You must build it first using 'npm run build:exe'.")
  }
}

describe("exe test", () => {
  const tableService = Azure.createTableService(
    createConnectionStringForTest(testLocalAzuriteInstance)
  );
  tableService.enableGlobalHttpAgent = true;

  let tableName: string = getUniqueName("table");

  const requestOverride = { headers: {} };

  let childPid: number;

  beforeEach(() => throwOnMissingBinary())

  before(async () => {
    throwOnMissingBinary()

    overrideRequest(requestOverride, tableService);
    tableName = getUniqueName("table");
    const child = execFile(
      binaryPath,
      ["--blobPort 11000", "--queuePort 11001", "--tablePort 11002"],
      { cwd: process.cwd(), shell: true, env: {} }
    );

    childPid = child.pid;

    const fullSuccessMessage =
      "Azurite Blob service is starting at " +
      blobAddress +
      "\nAzurite Blob service is successfully listening at " +
      blobAddress +
      "\nAzurite Queue service is starting at " +
      queueAddress +
      "\nAzurite Queue service is successfully listening at " +
      queueAddress +
      "\nAzurite Table service is starting at " +
      tableAddress +
      "\nAzurite Table service is successfully listening at " +
      tableAddress +
      "\n";
    let messageReceived: string = "";

    function stdoutOn() {
      return new Promise((resolve) => {
        // exclamation mark suppresses the TS error that "child.stdout is possibly null"
        child.stdout!.on("data", function (data: any) {
          messageReceived += data.toString();
          if (messageReceived == fullSuccessMessage) {
            resolve("resolveMessage");
          }
        });
      });
    }

    await stdoutOn();
  });

  after(async () => {
    // TO DO
    // Currently, the mocha test does not quit unless "--exit" is added to the mocha command
    // The current fix is to have "--exit" added but the issue causing mocha to be unable to
    // quit has not been identified
    restoreBuildRequestOptions(tableService);
    tableService.removeAllListeners();

    await find("name", "azurite.exe", true).then((list: any) => {
      if (list.length > 0) {
        process.kill(list[0].pid);
      }
    });

    if (childPid) {
      process.kill(childPid);
    }
  });

  describe("table test", () => {
    it("createTable, prefer=return-no-content, accept=application/json;odata=minimalmetadata @loki", (done) => {
      /* Azure Storage Table SDK doesn't support customize Accept header and Prefer header,
        thus we workaround this by override request headers to test following 3 OData levels responses.
      - application/json;odata=nometadata
      - application/json;odata=minimalmetadata
      - application/json;odata=fullmetadata
      */
      requestOverride.headers = {
        Prefer: "return-no-content",
        accept: "application/json;odata=minimalmetadata"
      };

      tableService.createTable(tableName, (error, result, response) => {
        if (!error) {
          assert.strictEqual(result.TableName, tableName);
          assert.strictEqual(result.statusCode, 204);
          const headers = response.headers!;
          assert.strictEqual(headers["x-ms-version"], TABLE_API_VERSION);
          assert.deepStrictEqual(response.body, "");
        }
        done();
      });
    });

    it("queryTable, accept=application/json;odata=minimalmetadata @loki", (done) => {
      /* Azure Storage Table SDK doesn't support customize Accept header and Prefer header,
        thus we workaround this by override request headers to test following 3 OData levels responses.
      - application/json;odata=nometadata
      - application/json;odata=minimalmetadata
      - application/json;odata=fullmetadata
      */
      requestOverride.headers = {
        accept: "application/json;odata=minimalmetadata"
      };

      tableService.listTablesSegmented(
        null as any,
        (error, result, response) => {
          if (!error) {
            assert.strictEqual(response.statusCode, 200);
            const headers = response.headers!;
            assert.strictEqual(headers["x-ms-version"], TABLE_API_VERSION);
            const bodies = response.body! as any;
            assert.deepStrictEqual(
              bodies["odata.metadata"],
              `${PROTOCOL}://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}/$metadata#Tables`
            );
            assert.ok(bodies.value[0].TableName);
          }
          done();
        }
      );
    });

    it("deleteTable that exists, @loki", (done) => {
      /*
      https://docs.microsoft.com/en-us/rest/api/storageservices/delete-table
      */
      requestOverride.headers = {};

      const tableToDelete = tableName + "del";

      tableService.createTable(tableToDelete, (error, result, response) => {
        if (!error) {
          tableService.deleteTable(
            tableToDelete,
            (deleteError, deleteResult) => {
              if (!deleteError) {
                // no body expected, we expect 204 no content on successful deletion
                assert.strictEqual(deleteResult.statusCode, 204);
              } else {
                assert.ifError(deleteError);
              }
              done();
            }
          );
        } else {
          assert.fail("Test failed to create the table");
          done();
        }
      });
    });

    it("deleteTable that does not exist, @loki", (done) => {
      // https://docs.microsoft.com/en-us/rest/api/storageservices/delete-table
      requestOverride.headers = {};

      const tableToDelete = tableName + "causeerror";

      tableService.deleteTable(tableToDelete, (error, result) => {
        assert.strictEqual(result.statusCode, 404); // no body expected, we expect 404
        const storageError = error as any;
        assert.strictEqual(storageError.code, "ResourceNotFound");
        done();
      });
    });

    it("createTable with invalid version, @loki", (done) => {
      requestOverride.headers = { [HeaderConstants.X_MS_VERSION]: "invalid" };

      tableService.createTable("test", (error, result) => {
        assert.strictEqual(result.statusCode, 400);
        done();
      });
    });
  });

  describe("blob test", () => {
    const factory = new BlobTestServerFactory();
    const blobServer = factory.createServer();

    const blobBaseURL = `http://${blobServer.config.host}:${blobServer.config.port}/devstoreaccount1`;
    const blobServiceClient = new BlobServiceClient(
      blobBaseURL,
      blobNewPipeline(
        new blobStorageSharedKeyCredential(
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

    let containerName: string = getUniqueName("container");
    let containerClient = blobServiceClient.getContainerClient(containerName);
    let blobName: string = getUniqueName("blob");
    let blobClient = containerClient.getBlobClient(blobName);
    let blockBlobClient = blobClient.getBlockBlobClient();
    const content = "Hello World";

    beforeEach(async () => {
      containerName = getUniqueName("container");
      containerClient = blobServiceClient.getContainerClient(containerName);
      await containerClient.create();
      blobName = getUniqueName("blob");
      blobClient = containerClient.getBlobClient(blobName);
      blockBlobClient = blobClient.getBlockBlobClient();
      await blockBlobClient.upload(content, content.length);
    });

    afterEach(async () => {
      await containerClient.delete();
    });
    it("download with default parameters @loki @sql", async () => {
      const result = await blobClient.download(0);
      assert.deepStrictEqual(
        await bodyToString(result, content.length),
        content
      );
      assert.equal(result.contentRange, undefined);
      assert.equal(
        result._response.request.headers.get("x-ms-client-request-id"),
        result.clientRequestId
      );
    });

    it("download should work with conditional headers @loki @sql", async () => {
      const properties = await blobClient.getProperties();
      const result = await blobClient.download(0, undefined, {
        conditions: {
          ifMatch: properties.etag,
          ifNoneMatch: "invalidetag",
          ifModifiedSince: new Date("2018/01/01"),
          ifUnmodifiedSince: new Date("2188/01/01")
        }
      });
      assert.deepStrictEqual(
        await bodyToString(result, content.length),
        content
      );
      assert.equal(result.contentRange, undefined);
      assert.equal(
        result._response.request.headers.get("x-ms-client-request-id"),
        result.clientRequestId
      );
    });
  });

  describe("queue test", () => {
    // TODO: Create a server factory as tests utils
    const host = "127.0.0.1";
    const port = 11001;

    const baseURL = `http://${host}:${port}/devstoreaccount1`;
    const serviceClient = new QueueServiceClient(
      baseURL,
      queueNewPipeline(
        new queueStorageSharedKeyCredential(
          EMULATOR_ACCOUNT_NAME,
          EMULATOR_ACCOUNT_KEY
        ),
        {
          retryOptions: { maxTries: 1 }
        }
      )
    );

    let queueName: string;
    let queueClient: QueueClient;

    beforeEach(async () => {
      queueName = getUniqueName("queue");
      queueClient = serviceClient.getQueueClient(queueName);
      await queueClient.create();
    });

    afterEach(async () => {
      await queueClient.delete();
    });

    it("setMetadata @loki", async () => {
      const metadata = {
        key0: "val0",
        keya: "vala",
        keyb: "valb"
      };
      const mResult = await queueClient.setMetadata(metadata);
      assert.equal(
        mResult._response.request.headers.get("x-ms-client-request-id"),
        mResult.clientRequestId
      );

      const result = await queueClient.getProperties();
      assert.deepEqual(result.metadata, metadata);
      assert.equal(
        result._response.request.headers.get("x-ms-client-request-id"),
        result.clientRequestId
      );
    });

    it("getProperties with default/all parameters @loki", async () => {
      const result = await queueClient.getProperties();
      assert.ok(result.approximateMessagesCount! >= 0);
      assert.ok(result.requestId);
      assert.ok(result.version);
      assert.ok(result.date);
    });

    it("SetAccessPolicy should work @loki", async () => {
      const queueAcl = [
        {
          accessPolicy: {
            expiresOn: new Date("2018-12-31T11:22:33.4567890Z"),
            permissions: "raup",
            startsOn: new Date("2017-12-31T11:22:33.4567890Z")
          },
          id: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="
        },
        {
          accessPolicy: {
            expiresOn: new Date("2030-11-31T11:22:33.4567890Z"),
            permissions: "a",
            startsOn: new Date("2017-12-31T11:22:33.4567890Z")
          },
          id: "policy2"
        }
      ];

      const sResult = await queueClient.setAccessPolicy(queueAcl);
      assert.equal(
        sResult._response.request.headers.get("x-ms-client-request-id"),
        sResult.clientRequestId
      );

      const result = await queueClient.getAccessPolicy();
      assert.deepEqual(result.signedIdentifiers, queueAcl);
      assert.equal(
        result._response.request.headers.get("x-ms-client-request-id"),
        result.clientRequestId
      );
    });
  });
});
