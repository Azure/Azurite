// Tests in this file are using @azure/data-tables

import * as assert from "assert";
import { TableClient, TablesSharedKeyCredential } from "@azure/data-tables";
import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import { EMULATOR_ACCOUNT_KEY, EMULATOR_ACCOUNT_NAME } from "../../testutils";
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
  // const tableName: string = getUniqueName("datatables");

  // const tableClient = new TableClient(
  //   `https://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}`,
  //   tableName,
  //   new TablesSharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY)
  // );

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

    const badTableClient = new TableClient(
      `https://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}`,
      "noExistingTable",
      new TablesSharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY)
    );

    // await badTableClient.create(); // deliberately do not create table
    const batch = badTableClient.createBatch(partitionKey);
    batch.createEntities(testEntities);

    try {
      const result = await batch.submitBatch();
      assert.ok(result.subResponses[0].rowKey);
    } catch (err) {
      assert.ifError(err);
    }
    await badTableClient.delete();
  });
});
