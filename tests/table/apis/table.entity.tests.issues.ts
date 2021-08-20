// Tests in this file are using @azure/data-tables

import * as assert from "assert";
import { odata, TableEntity } from "@azure/data-tables";
import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import { getUniqueName } from "../../testutils";
import {
  createAzureDataTablesClient,
  createTableServerForTestHttps,
  createUniquePartitionKey
} from "./table.entity.test.utils";

// Set true to enable debug log
configLogger(true);
// For convenience, we have a switch to control the use
// of a local Azurite instance, otherwise we need an
// ENV VAR called AZURE_TABLE_STORAGE added to mocha
// script or launch.json containing
// Azure Storage Connection String (using SAS or Key).
const testLocalAzuriteInstance = true;

describe("table Entity APIs test", () => {
  let server: TableServer;
  const tableName: string = getUniqueName("datatables");

  const tableClient = createAzureDataTablesClient(
    testLocalAzuriteInstance,
    tableName
  );

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

  it("should return 2001 entities from a paged query at 1000 entities per page, @loki", async () => {
    const partitionKeyForQueryTest1 = createUniquePartitionKey();
    const totalItems = 2001;
    await tableClient.create();

    // first partition
    // creates entities individually
    for (let i = 0; i < totalItems; i++) {
      const result = await tableClient.createEntity({
        partitionKey: partitionKeyForQueryTest1,
        rowKey: `${i}`,
        number: i
      });
      assert.notStrictEqual(result.etag, undefined);
    }

    const maxPageSize = 1000;

    const entities = tableClient.listEntities<TableEntity<{ number: number }>>({
      queryOptions: {
        filter: odata`PartitionKey eq ${partitionKeyForQueryTest1}`
      }
    });
    // let allPartition1: TableEntity<{ number: number }>[] = [];
    // this following test passes :
    // await entities.byPage({
    //   maxPageSize
    // });
    // for (let i = 0; i < 1001; i++) {
    //   const entity = await entities.next();
    //   assert.ok(entity);
    //   assert.strictEqual(entity.done, false);
    // }
    // const page1001 = await entities.next();
    // assert.strictEqual(page1001.done, true);

    // this test never finishes...
    let all: TableEntity<{ number: number }>[] = [];
    for await (const entity of entities.byPage({
      maxPageSize
    })) {
      all = [...all, ...entity];
    }
    assert.strictEqual(all.length, 2001);

    await tableClient.delete();
  });
});
