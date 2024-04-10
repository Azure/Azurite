// Tests in this file are using @azure/data-tables
// Tests in this file validate query logic
import * as assert from "assert";
import { Edm, odata, TableEntity, TableTransaction } from "@azure/data-tables";
import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import { getUniqueName } from "../../testutils";
import {
  AzureDataTablesTestEntityFactory,
  TableTestEntity
} from "../models/AzureDataTablesTestEntityFactory";
import {
  createAzureDataTablesClient,
  createTableServerForQueryTestHttps,
  createUniquePartitionKey
} from "../utils/table.entity.test.utils";
import uuid from "uuid";
import TableTestServerFactory from "../utils/TableTestServerFactory";
// import uuid from "uuid";
// Set true to enable debug log
configLogger(false);
// For convenience, we have a switch to control the use
// of a local Azurite instance, otherwise we need an
// ENV VAR called AZURE_TABLE_STORAGE added to mocha
// script or launch.json containing
// Azure Storage Connection String (using SAS or Key).
const testLocalAzuriteInstance = true;

const entityFactory = new AzureDataTablesTestEntityFactory();

describe("table Entity APIs test - using Azure/data-tables", () => {
  let server: TableServer;

  const requestOverride = { headers: {} }; // this is not used with data tables and this test set yet

  before(async () => {
    server = createTableServerForQueryTestHttps();
    await server.start();
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=nometadata" //fullmetadata"
    };
  });

  after(async () => {
    try {
      await server.close();
    } catch {
      // we don't care
    }
  });

  it("01. should find an int as a number, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("int")
    );
    const partitionKey = createUniquePartitionKey("");
    const testEntity: TableTestEntity =
      entityFactory.createBasicEntityForTest(partitionKey);

    await tableClient.createTable({ requestOptions: { timeout: 60000 } });
    const result = await tableClient.createEntity(testEntity);
    assert.ok(result.etag);

    const queryResult = await tableClient
      .listEntities<TableTestEntity>({
        queryOptions: {
          filter: `PartitionKey eq '${partitionKey}' and int32Field eq 54321`
        }
      })
      .next();
    assert.notStrictEqual(queryResult.value, undefined);
    await tableClient.deleteTable();
  });

  it("02. should find a long int, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("longint")
    );
    const partitionKey = createUniquePartitionKey("");
    const testEntity: TableTestEntity =
      entityFactory.createBasicEntityForTest(partitionKey);

    await tableClient.createTable({ requestOptions: { timeout: 60000 } });
    const result = await tableClient.createEntity(testEntity);
    assert.ok(result.etag);

    const queryResult = await tableClient
      .listEntities<TableTestEntity>({
        queryOptions: {
          filter: `PartitionKey eq '${partitionKey}' and int64Field eq 12345L`
        }
      })
      .next();
    assert.notStrictEqual(queryResult.value, undefined);

    await tableClient.deleteTable();
  });

  it("03. should find an entity using a partition key with multiple spaces, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("query1s")
    );
    const partitionKey = createUniquePartitionKey("") + " with spaces";
    const testEntity: TableTestEntity =
      entityFactory.createBasicEntityForTest(partitionKey);

    await tableClient.createTable({ requestOptions: { timeout: 60000 } });
    const result = await tableClient.createEntity(testEntity);
    assert.ok(result.etag);

    const queryResult = await tableClient
      .listEntities<TableTestEntity>({
        queryOptions: {
          filter: `PartitionKey eq '${partitionKey}'`
        }
      })
      .next();
    assert.notStrictEqual(queryResult.value, undefined);

    await tableClient.deleteTable();
  });

  it("04. should provide a complete query result when using query entities by page, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("querybypage")
    );
    const partitionKeyForQueryTest = createUniquePartitionKey("");
    const totalItems = 20;
    await tableClient.createTable();

    for (let i = 0; i < totalItems; i++) {
      const result = await tableClient.createEntity({
        partitionKey: partitionKeyForQueryTest,
        rowKey: `${i}`,
        foo: "testEntity"
      });
      assert.notStrictEqual(result.etag, undefined);
    }

    const maxPageSize = 5;
    const entities = tableClient.listEntities<TableEntity<{ foo: string }>>({
      queryOptions: {
        filter: odata`PartitionKey eq ${partitionKeyForQueryTest}`
      }
    });
    let all: TableEntity<{ foo: string }>[] = [];
    for await (const entity of entities.byPage({
      maxPageSize
    })) {
      all = [...all, ...entity];
    }
    assert.strictEqual(all.length, totalItems);
    all.sort((obj1, obj2) => {
      if (parseInt(obj1.rowKey, 10) > parseInt(obj2.rowKey, 10)) {
        return 1;
      } else if (obj1.rowKey === obj2.rowKey) {
        return 0;
      } else {
        return -1;
      }
    });
    let rowKeyChecker = 0;
    while (rowKeyChecker < totalItems) {
      assert.strictEqual(all[rowKeyChecker].rowKey, rowKeyChecker.toString());
      rowKeyChecker++;
    }
    await tableClient.deleteTable();
  });

  it("05. should return the correct number of results querying with a timestamp or different SDK whitespacing behaviours, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("sdkspace")
    );
    const partitionKeyForQueryTest = createUniquePartitionKey("");
    const totalItems = 10;
    await tableClient.createTable();
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() + 1);
    const newTimeStamp = timestamp.toISOString();
    for (let i = 0; i < totalItems; i++) {
      const result = await tableClient.createEntity({
        partitionKey: partitionKeyForQueryTest,
        rowKey: `${i}`,
        number: i
      });
      assert.notStrictEqual(result.etag, undefined);
    }
    const maxPageSize = 5;
    let testsCompleted = 0;
    // take note of the different whitespacing and query formatting:
    const queriesAndExpectedResult = [
      {
        queryOptions: {
          filter: odata`PartitionKey eq ${partitionKeyForQueryTest} and number gt 11`
        },
        expectedResult: 0
      },
      {
        queryOptions: {
          filter: odata`PartitionKey eq ${partitionKeyForQueryTest} and number lt 11`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`PartitionKey eq ${partitionKeyForQueryTest} and number gt 11 and Timestamp lt datetime'${newTimeStamp}'`
        },
        expectedResult: 0
      },
      {
        queryOptions: {
          filter: odata`PartitionKey eq ${partitionKeyForQueryTest} and number lt 11 and Timestamp lt datetime'${newTimeStamp}'`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (number lt 12) and (Timestamp lt datetime'${newTimeStamp}')`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest})and (number lt 12) and(Timestamp lt datetime'${newTimeStamp}')`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest})and(number lt 12)and(Timestamp lt datetime'${newTimeStamp}')`
        },
        expectedResult: 10
      }
    ];

    for (const queryTest of queriesAndExpectedResult) {
      const entities = tableClient.listEntities<
        TableEntity<{ number: number }>
      >({
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
        `Failed on query ${queryTest.queryOptions.filter}`
      );
      testsCompleted++;
    }
    assert.strictEqual(testsCompleted, 7, "Not all tests completed");
    await tableClient.deleteTable();
  });

  it("06. should return the correct number of results querying with a boolean field regardless of whitespacing behaviours, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("bool")
    );
    const partitionKeyForQueryTest = createUniquePartitionKey("bool");
    const totalItems = 10;
    await tableClient.createTable();
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() + 1);
    for (let i = 0; i < totalItems; i++) {
      const myBool: boolean = i % 2 !== 0 ? true : false;
      const result = await tableClient.createEntity({
        partitionKey: partitionKeyForQueryTest,
        rowKey: `${i}`,
        number: i,
        myBool
      });
      assert.notStrictEqual(result.etag, undefined);
    }
    const maxPageSize = 10;
    let testsCompleted = 0;
    // take note of the different whitespacing and query formatting:
    const queriesAndExpectedResult = [
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest})and(myBool eq true )`
        },
        expectedResult: 5
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (myBool eq true)`
        },
        expectedResult: 5
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (myBool eq false)`
        },
        expectedResult: 5
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest})and (myBool eq false)`
        },
        expectedResult: 5
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and(myBool eq false)`
        },
        expectedResult: 5
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (myBool eq false)`
        },
        expectedResult: 5
      }
    ];

    for (const queryTest of queriesAndExpectedResult) {
      const entities = tableClient.listEntities<
        TableEntity<{ number: number }>
      >({
        queryOptions: queryTest.queryOptions
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

  it("07. should return the correct number of results querying with an int64 field regardless of whitespacing behaviours, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("int64")
    );
    const partitionKeyForQueryTest = createUniquePartitionKey("int64");
    const totalItems = 10;
    await tableClient.createTable();
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() + 1);
    for (let i = 0; i < totalItems; i++) {
      const testEntity: TableTestEntity =
        entityFactory.createBasicEntityForTest(partitionKeyForQueryTest);
      testEntity.int64Field = { value: `${i}`, type: "Int64" };
      const result = await tableClient.createEntity(testEntity);
      assert.notStrictEqual(result.etag, undefined);
    }
    const maxPageSize = 10;
    let testsCompleted = 0;
    type queryOptions = {
      filter: string;
    };
    type queryAndResult = {
      queryOptions: queryOptions;
      expectedResult: Edm<"Int64">;
    };
    // take note of the different whitespacing and query formatting:
    const queriesAndExpectedResult: queryAndResult[] = [
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (int64Field eq 1L )`
        },
        expectedResult: { value: "1", type: "Int64" }
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (int64Field eq 2L)`
        },
        expectedResult: { value: "2", type: "Int64" }
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (int64Field eq 6L)`
        },
        expectedResult: { value: "6", type: "Int64" }
      }
    ];

    for (const queryTest of queriesAndExpectedResult) {
      const entities = tableClient.listEntities<TableTestEntity>({
        queryOptions: queryTest.queryOptions,
        disableTypeConversion: true
      });
      let all: TableTestEntity[] = [];
      for await (const entity of entities.byPage({
        maxPageSize
      })) {
        all = [...all, ...entity];
      }
      assert.strictEqual(
        all.length,
        1,
        `Failed on number of results with query ${queryTest.queryOptions.filter}`
      );

      assert.strictEqual(
        all[0].int64Field.value,
        queryTest.expectedResult.value,
        `Failed to validate value with query ${queryTest.queryOptions.filter}`
      );
      testsCompleted++;
    }
    assert.strictEqual(testsCompleted, queriesAndExpectedResult.length);
    await tableClient.deleteTable();
  });

  it("08. should return the correct number of results querying with a double field regardless of whitespacing behaviours, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("datatables")
    );
    const partitionKeyForQueryTest = createUniquePartitionKey("double");
    const totalItems = 10;
    await tableClient.createTable();
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() + 1);
    for (let i = 0; i < totalItems; i++) {
      const testEntity: TableTestEntity =
        entityFactory.createBasicEntityForTest(partitionKeyForQueryTest);
      const result = await tableClient.createEntity(testEntity);
      assert.notStrictEqual(result.etag, undefined);
    }
    const maxPageSize = 10;
    let testsCompleted = 0;
    // take note of the different whitespacing and query formatting:
    const queriesAndExpectedResult = [
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (doubleField eq 54.321 )`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (doubleField eq 54.321)`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (doubleField eq 54.321)`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (doubleField gt 53.321)`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (doubleField lt 57.321)`
        },
        expectedResult: 10
      }
    ];
    for (const queryTest of queriesAndExpectedResult) {
      const entities = tableClient.listEntities<TableTestEntity>({
        queryOptions: queryTest.queryOptions
      });
      let all: TableTestEntity[] = [];
      for await (const entity of entities.byPage({
        maxPageSize
      })) {
        all = [...all, ...entity];
      }
      assert.strictEqual(
        all.length,
        queryTest.expectedResult,
        `Failed on number of results with query ${queryTest.queryOptions.filter}`
      );
      assert.strictEqual(
        all[0].doubleField,
        54.321,
        `Failed on value of double returned by query ${queryTest.queryOptions.filter}`
      );
      testsCompleted++;
    }
    assert.strictEqual(testsCompleted, queriesAndExpectedResult.length);
    await tableClient.deleteTable();
  });

  it("09. should return the correct number of results querying with a double field containing a single digit number regardless of whitespacing behaviours, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("datatables")
    );
    const partitionKeyForQueryTest = createUniquePartitionKey("double");
    const totalItems = 10;
    await tableClient.createTable();
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() + 1);
    for (let i = 0; i < totalItems; i++) {
      const testEntity: TableTestEntity =
        entityFactory.createBasicEntityForTest(partitionKeyForQueryTest);
      testEntity.doubleField = { value: 5, type: "Double" };
      const result = await tableClient.createEntity(testEntity);
      assert.notStrictEqual(result.etag, undefined);
    }
    const maxPageSize = 10;
    let testsCompleted = 0;
    // take note of the different whitespacing and query formatting:
    const queriesAndExpectedResult = [
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (doubleField eq 5 )`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (doubleField eq 5.0)`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (doubleField eq 5)`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (doubleField gt 4)`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (doubleField lt 6)`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest})and(doubleField lt 6)`
        },
        expectedResult: 10
      }
    ];
    for (const queryTest of queriesAndExpectedResult) {
      const entities = tableClient.listEntities<TableTestEntity>({
        queryOptions: queryTest.queryOptions
      });
      let all: TableTestEntity[] = [];
      for await (const entity of entities.byPage({
        maxPageSize
      })) {
        all = [...all, ...entity];
      }
      assert.strictEqual(
        all.length,
        queryTest.expectedResult,
        `Failed on number of results with query ${queryTest.queryOptions.filter}`
      );
      assert.strictEqual(
        all[0].doubleField,
        5,
        `Failed on value of double returned by query ${queryTest.queryOptions.filter}`
      );
      testsCompleted++;
    }
    assert.strictEqual(testsCompleted, queriesAndExpectedResult.length);
    await tableClient.deleteTable();
  });

  it("10. should error on query with invalid filter string, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("dataTables")
    );
    const partitionKeyForQueryTest = createUniquePartitionKey("filter");
    const totalItems = 10;
    await tableClient.createTable();
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() + 1);
    for (let i = 0; i < totalItems; i++) {
      const testEntity: TableTestEntity =
        entityFactory.createBasicEntityForTest(partitionKeyForQueryTest);
      testEntity.doubleField = { value: 5, type: "Double" };
      const result = await tableClient.createEntity(testEntity);
      assert.notStrictEqual(result.etag, undefined);
    }
    const maxPageSize = 10;
    let testsCompleted = 0;
    // each of these queries is invalid and generates an error against the service
    // case (1 === 1) leads to status code 501 from the service, we return 400
    const queriesAndExpectedResult = [
      {
        queryOptions: {
          filter: odata`(1 === 1)`
        },
        expectedResult: 0
      },
      {
        queryOptions: {
          filter: odata`(1)`
        },
        expectedResult: 0
      },
      {
        queryOptions: {
          filter: odata`(1 1 1)`
        },
        expectedResult: 0
      },
      {
        queryOptions: {
          filter: odata`("a" eq "a")`
        },
        expectedResult: 0
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest} eq 5.0)`
        },
        expectedResult: 0
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq eq ${partitionKeyForQueryTest}) and (doubleField eq 5)`
        },
        expectedResult: 0
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and and (doubleField gt 4)`
        },
        expectedResult: 0
      }
    ];
    for (const queryTest of queriesAndExpectedResult) {
      const entities = tableClient.listEntities<TableTestEntity>({
        queryOptions: queryTest.queryOptions
      });

      try {
        let all: TableTestEntity[] = [];
        for await (const entity of entities.byPage({
          maxPageSize
        })) {
          all = [...all, ...entity];
        }
        // we should not hit this assert if the exception is generated.
        // it helps catch the cases which slip through filter validation
        assert.fail(`Query '${queryTest.queryOptions.filter}' did not generate the expected validation exception.`)
      } catch (filterException: any) {
        assert.strictEqual(
          [400, 501].includes(filterException.statusCode),
          true,
          `Filter "${queryTest.queryOptions.filter}" returned status code ${filterException.statusCode} instead of [400/501]. Unexpected error. We got : ${filterException.message}`
        );
      }
      testsCompleted++;
    }
    assert.strictEqual(testsCompleted, queriesAndExpectedResult.length);
    await tableClient.deleteTable();
  });

  it("11. should correctly insert and query entities using special values using batch api", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("decodeURI")
    );
    const partitionKeyForQueryTest = createUniquePartitionKey("decode");
    await tableClient.createTable();
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() + 1);
    const valuesForTest = [
      "%D1%88%D0%B5%D0%BB%D0%BB%D1%8B",
      "%2B",
      "%1C",
      "\u001c",
      "Übermütige Kühe mögen Umlaute",
      "grave à et aigu é"
    ];
    let testsCompleted = 0;
    for (const valToTest of valuesForTest) {
      const testEntity: TableTestEntity =
        entityFactory.createBasicEntityForTest(partitionKeyForQueryTest);
      testEntity.myValue = valToTest;
      const transaction = new TableTransaction();
      transaction.createEntity(testEntity);

      try {
        const result = await tableClient.submitTransaction(transaction.actions);
        assert.ok(result.subResponses[0].rowKey);
      } catch (err: any) {
        assert.strictEqual(err, undefined, `We failed with ${err}`);
      }

      const maxPageSize = 10;

      const entities = tableClient.listEntities<TableTestEntity>({
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (myValue eq ${valToTest})`
        }
      });
      let all: TableTestEntity[] = [];
      for await (const entity of entities.byPage({
        maxPageSize
      })) {
        all = [...all, ...entity];
      }
      assert.strictEqual(
        all.length,
        1,
        `Failed on number of results with this value ${valToTest}`
      );
      assert.strictEqual(
        all[0].myValue,
        valToTest,
        `Failed on value returned by query ${all[0].myValue} was not the same as ${valToTest}`
      );
      testsCompleted++;
    }
    assert.strictEqual(testsCompleted, valuesForTest.length);
    await tableClient.deleteTable();
  });

  it("12. should correctly return results for query on a binary property, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("binquery")
    );
    const partitionKeyForQueryTest = createUniquePartitionKey("bin");
    const totalItems = 10;
    await tableClient.createTable();
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() + 1);
    for (let i = 0; i < totalItems; i++) {
      const entity = entityFactory.createBasicEntityForTest(
        partitionKeyForQueryTest
      );
      if (i % 2 === 0) {
        entity.binaryField = Buffer.from("binaryData"); // should equal YmluYXJ5RGF0YQ==
      }
      const result = await tableClient.createEntity(entity);
      assert.notStrictEqual(result.etag, undefined);
    }
    const maxPageSize = 10;
    let testsCompleted = 0;
    const queriesAndExpectedResult = [
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (binaryField eq binary'62696e61727944617461')`
        },
        expectedResult: 5
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (binaryField eq X'62696e61727944617461')`
        },
        expectedResult: 5
      }
    ];

    for (const queryTest of queriesAndExpectedResult) {
      const entities = tableClient.listEntities<
        TableEntity<{ number: number }>
      >({
        queryOptions: queryTest.queryOptions
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

  // Skip the case when running in-memory. Backwards compatibility with old DBs does not apply.
  (TableTestServerFactory.inMemoryPersistence() ? it.skip : it)("13. should find both old and new guids (backwards compatible) when using guid type, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      "reproTable"
    );
    const partitionKeyForQueryTest = "1"; // partition key used in repro db with old schema
    const totalItems = 10;
    await tableClient.createTable();
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() + 1);
    const guidEntities: TableTestEntity[] = [];
    const guidFromOldDB = "5d62a508-f0f7-45bc-be10-4b192d7fed2d";

    const getResult1 = await tableClient.getEntity<TableTestEntity>(
      partitionKeyForQueryTest,
      "1"
    );
    assert.notStrictEqual(getResult1.etag, undefined);
    assert.strictEqual(
      getResult1.timestamp,
      "2022-06-24T15:50:57.055Z",
      "Did not match the timestamp on the legacy schema entity!"
    );

    const dupOldGuid = entityFactory.createBasicEntityForTest(
      partitionKeyForQueryTest
    );
    dupOldGuid.guidField.value = guidFromOldDB;
    dupOldGuid.myValue = "I am the new format GUID entry!";
    const dupResult = await tableClient.createEntity(dupOldGuid);
    assert.notStrictEqual(dupResult.etag, undefined);

    const getResult = await tableClient.getEntity<TableTestEntity>(
      dupOldGuid.partitionKey,
      dupOldGuid.rowKey
    );
    assert.notStrictEqual(getResult.etag, undefined);
    assert.strictEqual(
      getResult.myValue,
      "I am the new format GUID entry!",
      "New Guid entity not created as expected!"
    );

    guidEntities.push(dupOldGuid);

    for (let i = 1; i < totalItems; i++) {
      const entity = entityFactory.createBasicEntityForTest(
        partitionKeyForQueryTest
      );
      entity.guidField.value = uuid.v4();
      // The chances of hitting a duplicate GUID are extremely low
      // will only affect our pipelines in dev
      const result = await tableClient.createEntity(entity);
      assert.notStrictEqual(result.etag, undefined);
      guidEntities.push(entity);
    }
    const maxPageSize = 10;
    let testsCompleted = 0;
    const queriesAndExpectedResult = [
      {
        index: 0,
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (guidField eq guid'${guidFromOldDB}')`
        },
        expectedResult: 2, // we expect the old GUID to be found for backwards compatability and the one we just inserted
        // not sure that this is the right behavior
        expectedValue: guidFromOldDB
      },
      {
        index: 1,
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (guidField eq guid'${guidEntities[1].guidField.value}')`
        },
        expectedResult: 1,
        expectedValue: guidEntities[1].guidField.value
      },
      {
        index: 2,
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest})and (guidField eq ${guidEntities[1].guidField.value})`
        },
        expectedResult: 0,
        expectedValue: undefined
      },
      {
        index: 3,
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and(guidField eq guid'${guidEntities[8].guidField.value}')`
        },
        expectedResult: 1,
        expectedValue: guidEntities[8].guidField.value
      },
      {
        index: 4,
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest})and(guidField eq '${guidEntities[8].guidField.value}')`
        },
        expectedResult: 0,
        expectedValue: undefined
      }
    ];

    for (const queryTest of queriesAndExpectedResult) {
      const entities = tableClient.listEntities<TableTestEntity>({
        queryOptions: queryTest.queryOptions
      });
      let all: TableTestEntity[] = [];
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
      if (all[0] !== undefined) {
        assert.strictEqual(
          all[0].guidField.value,
          queryTest.expectedValue,
          `Test ${queryTest.index}: Guid value ${all[0].guidField.value} was not equal to ${queryTest.expectedValue} with query ${queryTest.queryOptions.filter}`
        );
      } else {
        assert.strictEqual(
          all[0],
          queryTest.expectedValue,
          `Value ${all[0]} was not equal to ${queryTest.expectedValue} with query ${queryTest.queryOptions.filter}`
        );
      }

      testsCompleted++;
    }
    assert.strictEqual(testsCompleted, queriesAndExpectedResult.length);
    await tableClient.deleteTable();
  });

  it("14. should work correctly when query filter contains true or false, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("querywithbool")
    );
    const partitionKeyForQueryTest = createUniquePartitionKey("");
    const totalItems = 5;
    await tableClient.createTable();

    for (let i = 0; i < totalItems; i++) {
      const result = await tableClient.createEntity({
        partitionKey: `${partitionKeyForQueryTest}${i}`,
        rowKey: `${i}`,
        foo: "testEntity"
      });
      assert.notStrictEqual(result.etag, undefined);
    }

    const maxPageSize = 5;
    const entities = tableClient.listEntities<TableEntity<{ foo: string }>>({
      queryOptions: {
        filter: odata`(true and RowKey eq '1') and ((false or PartitionKey eq '${partitionKeyForQueryTest}1') or PartitionKey eq '${partitionKeyForQueryTest}2') or PartitionKey eq '${partitionKeyForQueryTest}3'`
      }
    });
    let all: TableEntity<{ foo: string }>[] = [];
    for await (const entity of entities.byPage({
      maxPageSize
    })) {
      all = [...all, ...entity];
    }
    assert.strictEqual(all.length, 2);
    all.forEach((entity) => {
      assert.ok(
        entity.partitionKey === `${partitionKeyForQueryTest}3` ||
        ((entity.partitionKey === `${partitionKeyForQueryTest}1` ||
          entity.partitionKey === `${partitionKeyForQueryTest}2`) &&
          entity.rowKey === "1")
      );
    });
    await tableClient.deleteTable();
  });

  it("15. should find a property identifier starting with underscore, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("under")
    );
    const partitionKey = createUniquePartitionKey("");
    const testEntity = { partitionKey, rowKey: "1", _foo: "bar" };

    await tableClient.createTable({ requestOptions: { timeout: 60000 } });
    const result = await tableClient.createEntity(testEntity);
    assert.ok(result.etag);

    const queryResult = await tableClient
      .listEntities<TableTestEntity>({
        queryOptions: {
          filter: `PartitionKey eq '${partitionKey}' and _foo eq 'bar'`
        }
      })
      .next();
    assert.notStrictEqual(queryResult.value, undefined);
    await tableClient.deleteTable();
  });

  // issue 1828

  it("16. should find guids when using filter with ge, lt, gt and ne, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("guidfilters")
    );
    const partitionKeyForQueryTest = getUniqueName("1");
    const totalItems = 3;
    await tableClient.createTable();

    const guidEntities: TableTestEntity[] = [];

    const entity0 = entityFactory.createBasicEntityForTest(
      partitionKeyForQueryTest
    );
    entity0.guidField.value = "11111111-1111-1111-1111-111111111111";
    guidEntities.push(entity0);

    const entity1 = entityFactory.createBasicEntityForTest(
      partitionKeyForQueryTest
    );
    entity1.guidField.value = "22222222-2222-2222-2222-222222222222";
    guidEntities.push(entity1);

    const entity2 = entityFactory.createBasicEntityForTest(
      partitionKeyForQueryTest
    );
    entity2.guidField.value = "33333333-3333-3333-3333-333333333333";
    guidEntities.push(entity2);

    for (let i = 0; i < totalItems; i++) {
      const result = await tableClient.createEntity(guidEntities[i]);
      assert.notStrictEqual(result.etag, undefined);
    }

    const maxPageSize = 10;
    let testsCompleted = 0;
    const queriesAndExpectedResult = [
      {
        index: 0,
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (guidField ne guid'${guidEntities[1].guidField.value}')`
        },
        expectedResult: 2, // we insert 3 and don't want this one
        expectedValue: guidEntities[0].guidField.value
      },
      {
        index: 1,
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (guidField lt guid'${guidEntities[1].guidField.value}')`
        },
        expectedResult: 1,
        expectedValue: guidEntities[0].guidField.value
      },
      {
        index: 2,
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (guidField ge guid'${guidEntities[1].guidField.value}')`
        },
        expectedResult: 2,
        expectedValue: guidEntities[1].guidField.value
      },
      {
        index: 3,
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (guidField gt guid'${guidEntities[1].guidField.value}')`
        },
        expectedResult: 1,
        expectedValue: guidEntities[2].guidField.value
      }
    ];

    for (const queryTest of queriesAndExpectedResult) {
      try {
        const entities = tableClient.listEntities<TableTestEntity>({
          queryOptions: queryTest.queryOptions
        });
        let all: TableTestEntity[] = [];
        for await (const entity of entities.byPage({
          maxPageSize
        })) {
          all = [...all, ...entity];
        }
        assert.strictEqual(
          all.length,
          queryTest.expectedResult,
          `Failed with query ${queryTest.queryOptions.filter} (got ${all.length} entries, expected ${queryTest.expectedResult})`
        );
        if (all[0] !== undefined) {
          all.sort((a, b) => {
            return (
              parseInt(a.guidField.value[1], 10) -
              parseInt(b.guidField.value[1], 10)
            );
          });
          assert.strictEqual(
            all[0].guidField.value,
            queryTest.expectedValue,
            `Test ${queryTest.index}: Guid value ${all[0].guidField.value} was not equal to ${queryTest.expectedValue} with query ${queryTest.queryOptions.filter}`
          );
        } else {
          assert.strictEqual(
            all[0],
            queryTest.expectedValue,
            `Value ${all[0]} was not equal to ${queryTest.expectedValue} with query ${queryTest.queryOptions.filter}`
          );
        }

        testsCompleted++;
      } catch (err) {
        assert.fail(`Query '${queryTest.queryOptions.filter}' failed unexpectedly: ${err}`)
      }
    }
    assert.strictEqual(testsCompleted, queriesAndExpectedResult.length);
    await tableClient.deleteTable();
  });

  it("17. should work correctly when query filter single boolean and partition filter, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("partwithnot")
    );

    await tableClient.createTable();

    const result1 = await tableClient.createEntity({
      partitionKey: `Part1`,
      rowKey: `1`,
      foo: "testEntity1"
    });
    assert.notStrictEqual(result1.etag, undefined);

    const result2 = await tableClient.createEntity({
      partitionKey: `Part2`,
      rowKey: `1`,
      foo: "testEntity2"
    });
    assert.notStrictEqual(result2.etag, undefined);

    const result3 = await tableClient.createEntity({
      partitionKey: `Part3`,
      rowKey: `1`,
      foo: "testEntity3"
    });
    assert.notStrictEqual(result3.etag, undefined);

    const maxPageSize = 5;
    const entities = tableClient.listEntities<TableEntity<{ foo: string }>>({
      queryOptions: {
        filter: odata`not (PartitionKey lt 'Part2')`
      }
    });
    let all: TableEntity<{ foo: string }>[] = [];
    for await (const entity of entities.byPage({
      maxPageSize
    })) {
      all = [...all, ...entity];
    }
    assert.strictEqual(all.length, 2);
    all.forEach((entity) => {
      assert.ok(
        entity.partitionKey === `Part2` || entity.partitionKey === `Part3`
      );
    });

    await tableClient.deleteTable();
  });

  it("18. should return the correct number of results querying with a boolean field regardless of capitalization, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("bool")
    );
    const partitionKeyForQueryTest = createUniquePartitionKey("bool");
    const totalItems = 10;
    await tableClient.createTable();
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() + 1);
    for (let i = 0; i < totalItems; i++) {
      const myBool: boolean = i % 2 !== 0 ? true : false;
      const result = await tableClient.createEntity({
        partitionKey: partitionKeyForQueryTest,
        rowKey: `${i}`,
        number: i,
        myBool
      });
      assert.notStrictEqual(result.etag, undefined);
    }
    const maxPageSize = 10;
    let testsCompleted = 0;
    // take note of the different whitespacing and query formatting:
    const queriesAndExpectedResult = [
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest})and(myBool eq True )`
        },
        expectedResult: 5
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (myBool eq truE)`
        },
        expectedResult: 5
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (myBool eq FALSE)`
        },
        expectedResult: 5
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest})and (myBool eq faLsE)`
        },
        expectedResult: 5
      }
    ];

    for (const queryTest of queriesAndExpectedResult) {
      try {
        const entities = tableClient.listEntities<
          TableEntity<{ number: number }>
        >({
          queryOptions: queryTest.queryOptions
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
      } catch (err) {
        assert.fail(`Query '${queryTest.queryOptions.filter}' failed unexpectedly: ${err}`)
      }
    }
    assert.strictEqual(testsCompleted, queriesAndExpectedResult.length);
    await tableClient.deleteTable();
  });

  it("19. should work when empty field is queried, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("emptystringfieldneq")
    );

    await tableClient.createTable();

    const partitionKey = createUniquePartitionKey("");

    // This should get picked up by the query
    const result1 = await tableClient.createEntity({
      partitionKey: partitionKey,
      rowKey: `1`,
      foo: "TestFoo",
    });
    assert.notStrictEqual(result1.etag, undefined);

    // These next two entities should not
    const result2 = await tableClient.createEntity({
      partitionKey: partitionKey,
      rowKey: `2`,
      foo: "",
    });
    assert.notStrictEqual(result2.etag, undefined);

    const result3 = await tableClient.createEntity({
      partitionKey: partitionKey,
      rowKey: `3`
    });
    assert.notStrictEqual(result3.etag, undefined);

    const maxPageSize = 5;
    const entities = tableClient.listEntities<TableEntity<{ foo: string }>>({
      queryOptions: {
        filter: `PartitionKey eq '${partitionKey}' and foo ne ''`
      }
    });
    let all: TableEntity<{ foo: string }>[] = [];
    for await (const entity of entities.byPage({
      maxPageSize
    })) {
      all = [...all, ...entity];
    }
    assert.strictEqual(all.length, 1);
  });

  it("20. should work when getting special characters, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("specialcharactercheck")
    );

    await tableClient.createTable();

    const partitionKey = createUniquePartitionKey("");

    // Foo has some special characters
    const result1 = await tableClient.createEntity({
      partitionKey: partitionKey,
      rowKey: `1`,
      foo: "TestVal`",
    });
    assert.notStrictEqual(result1.etag, undefined);

    const maxPageSize = 5;
    const entities = tableClient.listEntities<TableEntity<{ foo: string }>>({
      queryOptions: {
        filter: `PartitionKey eq '${partitionKey}' and foo eq 'TestVal\`'`
      }
    });
    let all: TableEntity<{ foo: string }>[] = [];
    for await (const entity of entities.byPage({
      maxPageSize
    })) {
      all = [...all, ...entity];
    }
    assert.strictEqual(all.length, 1);

    await tableClient.deleteTable();
  });

  it("21. should work correctly when query filter is empty string, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("querywithbool")
    );
    const partitionKeyForQueryTest = createUniquePartitionKey("");
    const totalItems = 5;
    await tableClient.createTable();

    for (let i = 0; i < totalItems; i++) {
      const result = await tableClient.createEntity({
        partitionKey: `${partitionKeyForQueryTest}${i}`,
        rowKey: `${i}`,
        foo: "testEntity"
      });
      assert.notStrictEqual(result.etag, undefined);
    }

    const maxPageSize = 20;
    const entities = tableClient.listEntities<TableEntity<{ foo: string }>>({
      queryOptions: {
        filter: ""
      }
    });
    let all: TableEntity<{ foo: string }>[] = [];
    for await (const entity of entities.byPage({
      maxPageSize
    })) {
      all = [...all, ...entity];
    }
    assert.strictEqual(all.length, 5);
    await tableClient.deleteTable();
  });

  it("22. should work correctly when partition key is empty, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("emptypartitionkey")
    );
    await tableClient.createTable();

    const partitionKey = "";

    // Foo has some special characters
    const result1 = await tableClient.createEntity({
      partitionKey: partitionKey,
      rowKey: `1`,
      foo: "TestVal`",
    });
    assert.notStrictEqual(result1.etag, undefined);

    const maxPageSize = 5;
    const entities = tableClient.listEntities<TableEntity<{ foo: string }>>({
      queryOptions: {
        filter: `PartitionKey eq '' and foo eq 'TestVal\`'`
      }
    });
    let all: TableEntity<{ foo: string }>[] = [];
    for await (const entity of entities.byPage({
      maxPageSize
    })) {
      all = [...all, ...entity];
    }
    assert.strictEqual(all.length, 1);

    await tableClient.deleteTable();
  });

  it("23. should find the correct long int, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("longint")
    );
    const partitionKey = createUniquePartitionKey("");
    const testEntity: TableTestEntity =
      entityFactory.createBasicEntityForTest(partitionKey);

    await tableClient.createTable({ requestOptions: { timeout: 60000 } });
    let result = await tableClient.createEntity(testEntity);

    const anotherPartitionKey = createUniquePartitionKey("");
    const anotherEntity: TableTestEntity =
      entityFactory.createBasicEntityForTest(anotherPartitionKey);
    anotherEntity.int64Field = { value: "1234", type: "Int64" };

    result = await tableClient.createEntity(anotherEntity);
    assert.ok(result.etag);

    for await (const entity of tableClient
      .listEntities<TableTestEntity>({
        queryOptions: {
          filter: `int64Field gt 1233L and int64Field lt 1235L`
        }
      })) {
      assert.deepStrictEqual(entity.int64Field, 1234n);
    }

    await tableClient.deleteTable();
  });

  it("24. should find the correct negative long int, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("longint")
    );
    const partitionKey = createUniquePartitionKey("");
    const testEntity: TableTestEntity =
      entityFactory.createBasicEntityForTest(partitionKey);
    testEntity.int64Field = { value: "-12345", type: "Int64" };

    await tableClient.createTable({ requestOptions: { timeout: 60000 } });
    let result = await tableClient.createEntity(testEntity);

    const anotherPartitionKey = createUniquePartitionKey("");
    const anotherEntity: TableTestEntity =
      entityFactory.createBasicEntityForTest(anotherPartitionKey);
    anotherEntity.int64Field = { value: "-1234", type: "Int64" };

    result = await tableClient.createEntity(anotherEntity);
    assert.ok(result.etag);

    for await (const entity of tableClient
      .listEntities<TableTestEntity>({
        queryOptions: {
          filter: `int64Field lt -1233L and int64Field gt -1235L`
        }
      })) {
      assert.deepStrictEqual(entity.int64Field, -1234n);
    }

    await tableClient.deleteTable();
  });

  it("25. should find the correct negative long int, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("longint")
    );
    const partitionKey = createUniquePartitionKey("");
    const testEntity: TableTestEntity =
      entityFactory.createBasicEntityForTest(partitionKey);
    testEntity.int64Field = { value: "12345", type: "Int64" };

    await tableClient.createTable({ requestOptions: { timeout: 60000 } });
    let result = await tableClient.createEntity(testEntity);

    const anotherPartitionKey = createUniquePartitionKey("");
    const anotherEntity: TableTestEntity =
      entityFactory.createBasicEntityForTest(anotherPartitionKey);
    anotherEntity.int64Field = { value: "-1234", type: "Int64" };

    result = await tableClient.createEntity(anotherEntity);
    assert.ok(result.etag);

    let count = 0;

    for await (const entity of tableClient
      .listEntities<TableTestEntity>({
        queryOptions: {
          filter: `int64Field gt -1235L`
        }
      })) {
      entity;
      ++count;
    }

    assert.deepStrictEqual(count, 2);

    await tableClient.deleteTable();
  });
});
