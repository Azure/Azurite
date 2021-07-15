import * as assert from "assert";
import * as Azure from "azure-storage";

import { configLogger } from "../src/common/Logger";

import {
  HeaderConstants,
  TABLE_API_VERSION
} from "../src/table/utils/constants";
import {
  bodyToString,
  EMULATOR_ACCOUNT_NAME,
  EMULATOR_ACCOUNT_KEY,
  getUniqueName,
  overrideRequest,
  restoreBuildRequestOptions
} from "./testutils";
import {
  HOST,
  PROTOCOL,
  PORT,
  createConnectionStringForTest
} from "./table/apis/table.entity.test.utils";

import {
  StorageSharedKeyCredential as blobStorageSharedKeyCredential,
  newPipeline as blobNewPipeline,
  BlobServiceClient
} from "@azure/storage-blob";

import BlobTestServerFactory from "./BlobTestServerFactory";

import {
  newPipeline as queueNewPipeline,
  QueueServiceClient,
  QueueClient,
  StorageSharedKeyCredential as queueStorageSharedKeyCredential
} from "@azure/storage-queue";


// import { StoreDestinationArray } from "../src/common/persistence/IExtentStore";
// import QueueConfiguration from "../src/queue/QueueConfiguration";
// import Server from "../src/queue/QueueServer";


import { execFile } from "child_process";


// align the server address with the actual setting of Azurite for testing purposes
// following are the default values of Azurite.exe
let blobAddress = "http://127.0.0.1:11000";
let queueAddress = "http://127.0.0.1:11001";
let tableAddress = "http://127.0.0.1:11002";

// Set true to enable debug log
configLogger(false);
// For convenience, we have a switch to control the use
// of a local Azurite instance, otherwise we need an
// ENV VAR called AZURE_TABLE_STORAGE added to mocha
// script or launch.json containing
// Azure Storage Connection String (using SAS or Key).
const testLocalAzuriteInstance = true;

describe("exe test", () => {
  
  const tableService = Azure.createTableService(
    createConnectionStringForTest(testLocalAzuriteInstance)
  );
  tableService.enableGlobalHttpAgent = true;

  let tableName: string = getUniqueName("table");

  const requestOverride = { headers: {} };

  before(async () => {
    overrideRequest(requestOverride, tableService);
    tableName = getUniqueName("table");

    const child = execFile("C:\\Users\\v-runyaofan\\Desktop\\Azurite\\azurite.exe", ["--blobPort 11000", "--queuePort 11001", "--tablePort 11002"], {cwd: "C:\\Users\\v-runyaofan\\Desktop\\Azurite", shell: true, env: {}});

    // exclamation mark suppresses the TS error that "child.stdout is possibly null"
    let fullSuccessMessage = "Azurite Blob service is starting at " + blobAddress + "\nAzurite Blob service is successfully listening at " + blobAddress + 
                             "\nAzurite Queue service is starting at " + queueAddress + "\nAzurite Queue service is successfully listening at " + queueAddress + 
                             "\nAzurite Table service is starting at " + tableAddress + "\nAzurite Table service is successfully listening at " + tableAddress + "\n";
    let messageReceived : string = "";
    function stdoutOn() {
      return new Promise(resolve => {
        child.stdout!.on('data', function(data: any) {
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
    restoreBuildRequestOptions(tableService);
    tableService.removeAllListeners();
    // await child.kill('SIGINT');
  });
  
  // configuration needed for testing blob services
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
  // let blobLeaseClient = blobClient.getBlobLeaseClient();
  const content = "Hello World";

  beforeEach(async () => {
    containerName = getUniqueName("container");
    containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.create();
    blobName = getUniqueName("blob");
    blobClient = containerClient.getBlobClient(blobName);
    blockBlobClient = blobClient.getBlockBlobClient();
    // blobLeaseClient = blobClient.getBlobLeaseClient();
    await blockBlobClient.upload(content, content.length);
    // above is configuration for blob
    // below is configuration for queue
    queueName = getUniqueName("queue");
    queueClient = serviceClient.getQueueClient(queueName);
    await queueClient.create();
  });

  afterEach(async () => {
    await containerClient.delete();
    await queueClient.delete();
  });



  // end of configuration needed for testing blob services

  // TODO: Create a server factory as tests utils
  const host = "127.0.0.1";
  const port = 11001;
  // const metadataDbPath = "__queueTestsStorage__";
  // const extentDbPath = "__queueExtentTestsStorage__";
  // const persistencePath = "__queueTestsPersistence__";

  // const DEFUALT_QUEUE_PERSISTENCE_ARRAY: StoreDestinationArray = [
  //   {
  //     locationId: "queueTest",
  //     locationPath: persistencePath,
  //     maxConcurrency: 10
  //   }
  // ];

  // const config = new QueueConfiguration(
  //   host,
  //   port,
  //   metadataDbPath,
  //   extentDbPath,
  //   DEFUALT_QUEUE_PERSISTENCE_ARRAY,
  //   false
  // );

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

  // let server: Server;
  let queueName: string;
  let queueClient: QueueClient;



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

    tableService.listTablesSegmented(null as any, (error, result, response) => {
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
    });
  });

  
  it("deleteTable that exists, @loki", (done) => {
    /*
    https://docs.microsoft.com/en-us/rest/api/storageservices/delete-table
    */
    requestOverride.headers = {};

    const tableToDelete = tableName + "del";

    tableService.createTable(tableToDelete, (error, result, response) => {
      if (!error) {
        tableService.deleteTable(tableToDelete, (deleteError, deleteResult) => {
          if (!deleteError) {
            // no body expected, we expect 204 no content on successful deletion
            assert.strictEqual(deleteResult.statusCode, 204);
          } else {
            assert.ifError(deleteError);
          }
          done();
        });
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

  it("download with with default parameters @loki @sql", async () => {
    const result = await blobClient.download(0);
    assert.deepStrictEqual(await bodyToString(result, content.length), content);
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
    assert.deepStrictEqual(await bodyToString(result, content.length), content);
    assert.equal(result.contentRange, undefined);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
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

});

