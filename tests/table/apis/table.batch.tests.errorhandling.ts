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
  createTableServerForTestHttps,
  createUniquePartitionKey,
  HOST,
  PORT
} from "./table.entity.test.utils";

// Set true to enable debug log
configLogger(false);

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
    const partitionKey = createUniquePartitionKey();
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
    } catch (err) {
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, "TableNotFound");
    }
  });

  it("Batch API should reject request with more than 100 transactions, @loki", async () => {
    const partitionKey = createUniquePartitionKey();
    const tableName: string = getUniqueName("datatables");
    const testEntities: AzureDataTablesTestEntity[] = [];
    const TOO_MANY_REQUESTS = 101;
    while (testEntities.length < TOO_MANY_REQUESTS) {
      testEntities.push(createBasicEntityForTest(partitionKey));
    }

    const sharedKeyCredential = new AzureNamedKeyCredential(
      EMULATOR_ACCOUNT_NAME,
      EMULATOR_ACCOUNT_KEY
    );

    const tooManyRequestsClient = new TableClient(
      `https://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}`,
      tableName,
      sharedKeyCredential
    );

    await tooManyRequestsClient.createTable();

    const transaction = new TableTransaction();
    for (const testEntity of testEntities) {
      transaction.createEntity(testEntity);
    }

    try {
      await tooManyRequestsClient.submitTransaction(transaction.actions);
    } catch (err) {
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, "InvalidInput");
    }
  });
});
