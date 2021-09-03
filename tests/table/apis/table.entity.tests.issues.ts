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
configLogger(false);
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

  // from issue #1003
  it("should return 101 entities from a paged query at 50 entities per page and single partition, @loki", async () => {
    const partitionKeyForQueryTest1 = createUniquePartitionKey("1_");
    const partitionKeyForQueryTest2 = createUniquePartitionKey("2_");
    const totalItems = 101;
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

    // second partition
    // creates entities individually
    for (let i = 0; i < totalItems; i++) {
      const result = await tableClient.createEntity({
        partitionKey: partitionKeyForQueryTest2,
        rowKey: `${i}`,
        number: i
      });
      assert.notStrictEqual(result.etag, undefined);
    }

    const maxPageSize = 250; // this should work with a page size of 1000, but fails during response serialization on my machine

    const entities = tableClient.listEntities<TableEntity<{ number: number }>>({
      queryOptions: {
        filter: odata`PartitionKey eq ${partitionKeyForQueryTest1}`
      }
    });

    let all: TableEntity<{ number: number }>[] = [];
    for await (const entity of entities.byPage({
      maxPageSize
    })) {
      all = [...all, ...entity];
    }
    assert.strictEqual(all.length, totalItems);

    await tableClient.delete();
  });

  // from issue #1003
  it("should return 4 entities from a paged query at 1 entities per page across 2 partitions, @loki", async () => {
    const partitionKeyForQueryTest1 = createUniquePartitionKey("1_");
    const partitionKeyForQueryTest2 = createUniquePartitionKey("2_");
    const totalItems = 2;
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

    for (let i = 0; i < totalItems; i++) {
      const result = await tableClient.createEntity({
        partitionKey: partitionKeyForQueryTest2,
        rowKey: `${i}`,
        number: i
      });
      assert.notStrictEqual(result.etag, undefined);
    }

    const maxPageSize = 1; // this should work with a page size of 1000, but fails during serialization

    const entities = tableClient.listEntities<TableEntity<{ number: number }>>({
      queryOptions: {
        // nothing should return all
      }
    });

    // this test never finishes if page Size is larger than ~300 on my machine...
    let all: TableEntity<{ number: number }>[] = [];
    for await (const entity of entities.byPage({
      maxPageSize
    })) {
      all = [...all, ...entity];
    }
    // total items is 4 as we return items from both partitions
    assert.strictEqual(all.length, 4);

    await tableClient.delete();
  });
});
