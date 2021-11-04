// Tests in this file are using @azure/data-tables

import * as assert from "assert";
import { TableClient, TableTransaction } from "@azure/data-tables";
import { AzureNamedKeyCredential } from "@azure/core-auth";
import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../../testutils";
import {
  AzureDataTablesTestEntity,
  createBasicEntityForTest
} from "./AzureDataTablesTestEntity";
import {
  createAzureDataTablesClient,
  createTableServerForTestHttps,
  createUniquePartitionKey,
  HOST,
  PORT
} from "./table.entity.test.utils";
import { RestError } from "@azure/core-http";

// Set true to enable debug log
configLogger(false);
// For convenience, we have a switch to control the use
// of a local Azurite instance, otherwise we need an
// ENV VAR called AZURE_TABLE_STORAGE added to mocha
// script or launch.json containing
// Azure Storage Connection String (using SAS or Key).
const testLocalAzuriteInstance = true;

describe("table Entity APIs test", () => {
  let server: TableServer;

  const requestOverride = { headers: {} };

  before(async () => {
    server = createTableServerForTestHttps();
    await server.start();
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
  });

  after(async () => {
    await server.close();
  });

  it("Batch API should serialize errors according to group transaction spec, @loki", async () => {
    const partitionKey = createUniquePartitionKey("");
    const testEntities: AzureDataTablesTestEntity[] = [
      createBasicEntityForTest(partitionKey),
      createBasicEntityForTest(partitionKey),
      createBasicEntityForTest(partitionKey)
    ];

    const sharedKeyCredential = new AzureNamedKeyCredential(
      EMULATOR_ACCOUNT_NAME,
      EMULATOR_ACCOUNT_KEY
    );

    const badTableClient = new TableClient(
      `https://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}`,
      "noExistingTable",
      sharedKeyCredential
    );

    // await badTableClient.create(); // deliberately do not create table
    const transaction = new TableTransaction();
    for (const testEntity of testEntities) {
      transaction.createEntity(testEntity);
    }

    try {
      await badTableClient.submitTransaction(transaction.actions);
    } catch (err: any) {
      assert.strictEqual(err.statusCode, 404);
      assert.strictEqual(err.code, "TableNotFound");
    }
  });

  it("Batch API should reject request with more than 100 transactions, @loki", async () => {
    const partitionKey = createUniquePartitionKey("");
    const tableName100: string = getUniqueName("datatables");
    const testEntities: AzureDataTablesTestEntity[] = [];
    const TOO_MANY_REQUESTS = 101;
    while (testEntities.length < TOO_MANY_REQUESTS) {
      testEntities.push(createBasicEntityForTest(partitionKey));
    }

    const tooManyRequestsClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      tableName100
    );

    await tooManyRequestsClient.createTable();

    const transaction = new TableTransaction();
    for (const testEntity of testEntities) {
      transaction.createEntity(testEntity);
    }

    try {
      await tooManyRequestsClient.submitTransaction(transaction.actions);
    } catch (err: any) {
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, "InvalidInput");
    }
  });

  it("Batch API should rollback insert Entity transactions, @loki", async () => {
    const partitionKey = createUniquePartitionKey("");
    const tableNameBatchError: string = getUniqueName("datatables");
    const testEntities: AzureDataTablesTestEntity[] = [
      createBasicEntityForTest(partitionKey),
      createBasicEntityForTest(partitionKey),
      createBasicEntityForTest(partitionKey)
    ];

    const tableClientrollback = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      tableNameBatchError
    );

    await tableClientrollback.createTable();

    const transaction = new TableTransaction();
    for (const testEntity of testEntities) {
      transaction.createEntity(testEntity);
    }

    // force "Entity already exists" error
    for (const testEntity of testEntities) {
      transaction.createEntity(testEntity);
    }

    try {
      const result = await tableClientrollback.submitTransaction(
        transaction.actions
      );
      assert.ok(result.subResponses[0].rowKey);
    } catch (err: any) {
      const restErr = err as RestError;
      assert.strictEqual(
        restErr.statusCode,
        409,
        "Did not get expected entity already exists error."
      );
    }

    try {
      const shouldNotExist =
        await tableClientrollback.getEntity<AzureDataTablesTestEntity>(
          testEntities[0].partitionKey,
          testEntities[0].rowKey
        );
      assert.strictEqual(shouldNotExist, null, "We should not have an entity.");
    } catch (err: any) {
      const restErr2 = err as RestError;
      assert.strictEqual(
        restErr2.statusCode,
        404,
        "We expected an entity not found error."
      );
    }
    await tableClientrollback.deleteTable();
  });
});
