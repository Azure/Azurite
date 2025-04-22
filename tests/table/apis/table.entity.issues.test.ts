// Tests in this file are using @azure/data-tables
import * as assert from "assert";
import {
  GetTableEntityResponse,
  odata,
  TableEntity,
  TableEntityResult,
  TableItem
} from "@azure/data-tables";
import { configLogger } from "../../../src/common/Logger";
import StorageError from "../../../src/table/errors/StorageError";
import TableServer from "../../../src/table/TableServer";
import { getUniqueName } from "../../testutils";
import {
  createAzureDataTablesClient,
  createAzureDataTableServiceClient,
  createTableServerForTestHttps,
  createUniquePartitionKey
} from "../utils/table.entity.test.utils";
import {
  AzureDataTablesTestEntityFactory,
  TableTestEntity
} from "../models/AzureDataTablesTestEntityFactory";

// Set true to enable debug log
configLogger(false);
// For convenience, we have a switch to control the use
// of a local Azurite instance, otherwise we need an
// ENV VAR called AZURE_TABLE_STORAGE added to mocha
// script or launch.json containing
// Azure Storage Connection String (using SAS or Key).
const testLocalAzuriteInstance = true;

const entityFactory = new AzureDataTablesTestEntityFactory();

describe("table Entity APIs test : Issues", () => {
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

  // from issue #1229
  [
    'W/"wrong"',
    "W/\"datetime'2015-01-01T23%3A14%3A33.4980000Z'\"",
    'w/"wrong"',
    "w/\"datetime'2015-01-01T23%3A14%3A33.4980000Z'\""
  ].forEach((etag) => {
    it(`should allow any valid weak etag <${etag}>, @loki`, async () => {
      const partitionKey = createUniquePartitionKey();
      const tableClient = createAzureDataTablesClient(
        testLocalAzuriteInstance,
        tableName
      );
      await tableClient.createTable();

      const entity = {
        partitionKey: partitionKey,
        rowKey: "rk"
      };
      const response = await tableClient.createEntity(entity);

      try {
        await tableClient.updateEntity(entity, "Replace", { etag });
        assert.fail();
      } catch (error: any) {
        assert.strictEqual(error.statusCode, 412);
      }

      const existing = await tableClient.getEntity(
        entity.partitionKey,
        entity.rowKey
      );
      assert.strictEqual(response.etag, existing.etag);

      await tableClient.deleteTable();
    });
  });

  // from issue #1229
  [
    '"wrong"',
    "\"datetime'2015-01-01T23%3A14%3A33.4980000Z'\"",
    "wrong",
    "datetime'2015-01-01T23%3A14%3A33.4980000Z'",
    '"'
  ].forEach((etag) => {
    it(`should reject invalid or strong etag <${etag}>, @loki`, async () => {
      const partitionKey = createUniquePartitionKey();
      const tableClient = createAzureDataTablesClient(
        testLocalAzuriteInstance,
        tableName
      );
      await tableClient.createTable();

      const entity = {
        partitionKey: partitionKey,
        rowKey: "rk"
      };
      const response = await tableClient.createEntity(entity);

      try {
        await tableClient.updateEntity(entity, "Replace", { etag });
        assert.fail();
      } catch (error: any) {
        assert.strictEqual(error.statusCode, 400);
      }

      const existing = await tableClient.getEntity(
        entity.partitionKey,
        entity.rowKey
      );
      assert.strictEqual(response.etag, existing.etag);

      await tableClient.deleteTable();
    });
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

    const maxPageSize = 50; // this should work with a page size of 1000, but fails during response serialization on my machine

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

  it("should return 101 entities from a paged query at 20 entities per page and each different partition, @loki", async () => {
    const totalItems = 101;
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      tableName
    );
    await tableClient.createTable();

    // creates entities individually
    for (let i = 0; i < totalItems; i++) {
      const result = await tableClient.createEntity({
        partitionKey: createUniquePartitionKey(`A${i}_`),
        rowKey: "",
        number: i
      });
      assert.notStrictEqual(result.etag, undefined);
    }

    const maxPageSize = 20;
    const entities = tableClient.listEntities<TableEntity<{ number: number }>>({
      queryOptions: {}
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
  it("should allow the deletion of entities using empty string as the partition key, @loki", async () => {
    const emptyPartitionKey = "";
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      tableName
    );
    await tableClient.createTable();
    const entityWithEmptyPartitionKey =
      entityFactory.createBasicEntityForTest(emptyPartitionKey);

    const result = await tableClient.createEntity<TableTestEntity>(
      entityWithEmptyPartitionKey
    );
    assert.notStrictEqual(result.etag, undefined);

    const entityWithEmptyPartitionKeyRes =
      await tableClient.getEntity<TableTestEntity>(
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
    let res: TableTestEntity | undefined;
    try {
      res = (await tableClient.getEntity(
        "",
        entityWithEmptyPartitionKey.rowKey
      )) as GetTableEntityResponse<TableEntityResult<TableTestEntity>>;
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
    const entityWithEmptyRowKey = entityFactory.createBasicEntityForTest(
      partitionKeyForEmptyRowKey
    );

    entityWithEmptyRowKey.rowKey = "";

    const result = await tableClient.createEntity<TableTestEntity>(
      entityWithEmptyRowKey
    );
    assert.notStrictEqual(result.etag, undefined);

    const entityWithEmptyRowKeyRes =
      await tableClient.getEntity<TableTestEntity>(
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
    let res: TableTestEntity | undefined;
    try {
      res = (await tableClient.getEntity(
        partitionKeyForEmptyRowKey,
        ""
      )) as GetTableEntityResponse<TableEntityResult<TableTestEntity>>;
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

  //from issue #2013
  it("Malformed Etag when sent as input throws InvalidInput for table operations, ", async() => {
    const partitionKey = createUniquePartitionKey("𤭢PK1");
    const malformedEtag = "MalformedEtag";
    const rowKey = "𐐷RK1"
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      tableName
    );

    await tableClient.createTable();
    await tableClient.createEntity({
      partitionKey: partitionKey,
      rowKey: "𐐷RK1"
    });

    tableClient.deleteEntity(
      partitionKey,
      rowKey,
      {
        etag: malformedEtag
      }
    ).catch((reason) => {
      assert.strictEqual(reason.details.errorCode, "InvalidInput");
      assert.strictEqual(reason.statusCode, 400);
    });

    tableClient.updateEntity({
      partitionKey: partitionKey,
      rowKey: rowKey,
      ifMatch: malformedEtag
    }).catch((reason) => {
      const storageError = reason as StorageError;
      assert.strictEqual(storageError.statusCode, "InvalidInput");
      assert.strictEqual(storageError.storageErrorCode, 400);
    });

    await tableClient.deleteTable();
  });

  //from issue #2450
  it("should parce a simple query entity @loki", async () => {
    const partitionKeyForQueryTest1 = createUniquePartitionKey("1_");
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

    const maxPageSize = 5; // this should work with a page size of 1000, but fails during response serialization on my machine
    let testsCompleted = 0;
    // take note of the different whitespacing and query formatting:
    const queriesAndExpectedResult = [
      {
        queryOptions: {
          filter: ``
        },
        expectedResult: 2
      },
      {
        queryOptions: {
          filter: `false`
        },
        expectedResult: 0
      },
      {
        queryOptions: {
          filter: `true`
        },
        expectedResult: 2
      }
    ];
    
        for (const queryTest of queriesAndExpectedResult) {
          const entities = tableClient.listEntities<TableEntity<{ number: number }>>({
            queryOptions: queryTest.queryOptions,
            disableTypeConversion: true
          });
          let all: TableEntity<{ number: number }>[] = [];
          for await (const entity of entities.byPage({
            maxPageSize
          })) {
            all = [...all, ...entity];
          }
          assert.strictEqual(
            all.length,
            queryTest.expectedResult,
            `Failed with query ${queryTest.queryOptions.filter}`
          );
          testsCompleted++;
        }
        assert.strictEqual(testsCompleted, queriesAndExpectedResult.length);
        await tableClient.deleteTable();

  });
  //from issue #2450
  it("should parce a simple query tables @loki", async () => {
    const tableClient = createAzureDataTableServiceClient(
      testLocalAzuriteInstance
    );

    // not all test remove tables after running
    // so we need to remove the table if it exists
    const maxPageSize = 5; 
    const tables = tableClient.listTables();
    let all: TableItem[] = [];
    for await (const table of tables.byPage({
      maxPageSize
    })) {
      all = [...all, ...table];
    }

    for (const table of all) {
      if(table.name) {     
        await tableClient.deleteTable(table.name);
      }
    }

    await tableClient.createTable(tableName);

    let testsCompleted = 0;
    // take note of the different whitespacing and query formatting:
    const queriesAndExpectedResult = [
      {
        queryOptions: {
          filter: ``
        },
        expectedResult: 1
      },
      {
        queryOptions: {
          filter: `false`
        },
        expectedResult: 0
      },
      {
        queryOptions: {
          filter: `true`
        },
        expectedResult: 1
      }
    ];
    
        for (const queryTest of queriesAndExpectedResult) {
          const tables = tableClient.listTables({
            queryOptions: queryTest.queryOptions
          });
          let all: TableItem[] = [];
          for await (const table of tables.byPage({
            maxPageSize
          })) {
            all = [...all, ...table];
          }
          assert.strictEqual(
            all.length,
            queryTest.expectedResult,
            `Failed with query ${queryTest.queryOptions.filter}`
          );
          testsCompleted++;
        }
        assert.strictEqual(testsCompleted, queriesAndExpectedResult.length);
        await tableClient.deleteTable(tableName);

  });
});
