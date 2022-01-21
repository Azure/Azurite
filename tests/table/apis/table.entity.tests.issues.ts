// Tests in this file are using @azure/data-tables
import * as assert from "assert";
import {
  GetTableEntityResponse,
  odata,
  TableEntity,
  TableEntityResult
} from "@azure/data-tables";
import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import { getUniqueName } from "../../testutils";
import {
  createAzureDataTablesClient,
  createTableServerForTestHttps,
  createUniquePartitionKey
} from "../utils/table.entity.test.utils";
import {
  AzureDataTablesTestEntity,
  createBasicEntityForTest
} from "../models/AzureDataTablesTestEntity";

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
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      tableName
    );
    await tableClient.createTable();

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

    await tableClient.deleteTable();
  });

  // from issue #1214
  it("should allow continuation tokens with non-ASCII characters, @loki", async () => {
    const partitionKey1 = createUniquePartitionKey("𤭢PK1");
    const partitionKey2 = createUniquePartitionKey("𤭢PK2");
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      tableName
    );
    await tableClient.createTable();
    await tableClient.createEntity({
      partitionKey: partitionKey1,
      rowKey: "𐐷RK1"
    });
    await tableClient.createEntity({
      partitionKey: partitionKey2,
      rowKey: "𐐷RK2"
    });

    const entities = tableClient.listEntities<TableEntity>();
    let all: TableEntity[] = [];
    for await (const entity of entities.byPage({ maxPageSize: 1 })) {
      all = [...all, ...entity];
    }

    assert.strictEqual(all.length, 2);
    assert.strictEqual(partitionKey1, all[0].partitionKey);
    assert.strictEqual("𐐷RK1", all[0].rowKey);
    assert.strictEqual(partitionKey2, all[1].partitionKey);
    assert.strictEqual("𐐷RK2", all[1].rowKey);

    await tableClient.deleteTable();
  });

  // from issue #1003
  it("should return 4 entities from a paged query at 1 entities per page across 2 partitions, @loki", async () => {
    const partitionKeyForQueryTest1 = createUniquePartitionKey("1_");
    const partitionKeyForQueryTest2 = createUniquePartitionKey("2_");
    const totalItems = 2;
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      tableName
    );
    await tableClient.createTable();

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

    await tableClient.deleteTable();
  });

  // from issue #1201
  it("should allow the deletion of entities using empty string as the parition key, @loki", async () => {
    const emptyPartitionKey = "";
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      tableName
    );
    await tableClient.createTable();
    const entityWithEmptyPartitionKey =
      createBasicEntityForTest(emptyPartitionKey);

    const result = await tableClient.createEntity<AzureDataTablesTestEntity>(
      entityWithEmptyPartitionKey
    );
    assert.notStrictEqual(result.etag, undefined);

    const entityWithEmptyPartitionKeyRes =
      await tableClient.getEntity<AzureDataTablesTestEntity>(
        "",
        entityWithEmptyPartitionKey.rowKey
      );

    assert.strictEqual(
      entityWithEmptyPartitionKeyRes.partitionKey,
      "",
      "failed to find the correct entity with empty string partition key"
    );
    assert.strictEqual(
      entityWithEmptyPartitionKeyRes.rowKey,
      entityWithEmptyPartitionKey.rowKey,
      "failed to find the correct entity with matching row key"
    );

    tableClient
      .deleteEntity("", entityWithEmptyPartitionKey.rowKey)
      .catch((reason) => {
        assert.ifError(reason);
      });

    // deliberately being more explicit in the resolution of the promise and errors
    let res: AzureDataTablesTestEntity | undefined;
    try {
      res = (await tableClient.getEntity(
        "",
        entityWithEmptyPartitionKey.rowKey
      )) as GetTableEntityResponse<
        TableEntityResult<AzureDataTablesTestEntity>
      >;
    } catch (deleteError: any) {
      assert.strictEqual(deleteError.statusCode, 404);
    } finally {
      assert.strictEqual(
        res,
        undefined,
        "We were not expecting to find the entity!"
      );
    }

    await tableClient.deleteTable();
  });

  it("should allow the deletion of entities using empty string as the row key, @loki", async () => {
    const partitionKeyForEmptyRowKey = createUniquePartitionKey("empty1");
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      tableName
    );
    await tableClient.createTable();
    const entityWithEmptyRowKey = createBasicEntityForTest(
      partitionKeyForEmptyRowKey
    );

    entityWithEmptyRowKey.rowKey = "";

    const result = await tableClient.createEntity<AzureDataTablesTestEntity>(
      entityWithEmptyRowKey
    );
    assert.notStrictEqual(result.etag, undefined);

    const entityWithEmptyRowKeyRes =
      await tableClient.getEntity<AzureDataTablesTestEntity>(
        partitionKeyForEmptyRowKey,
        ""
      );

    assert.strictEqual(
      entityWithEmptyRowKeyRes.partitionKey,
      partitionKeyForEmptyRowKey,
      "failed to find the correct entity with empty string partition key"
    );
    assert.strictEqual(
      entityWithEmptyRowKeyRes.rowKey,
      "",
      "failed to find the correct entity with matching row key"
    );

    tableClient
      .deleteEntity(partitionKeyForEmptyRowKey, entityWithEmptyRowKeyRes.rowKey)
      .catch((reason) => {
        assert.ifError(reason);
      });

    // deliberately being more explicit in the resolution of the promise and errors
    let res: AzureDataTablesTestEntity | undefined;
    try {
      res = (await tableClient.getEntity(
        partitionKeyForEmptyRowKey,
        ""
      )) as GetTableEntityResponse<
        TableEntityResult<AzureDataTablesTestEntity>
      >;
    } catch (deleteError: any) {
      assert.strictEqual(deleteError.statusCode, 404);
    } finally {
      assert.strictEqual(
        res,
        undefined,
        "We were not expecting to find the entity!"
      );
    }

    await tableClient.deleteTable();
  });
});
