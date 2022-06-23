// Tests in this file are using @azure/data-tables
// Tests in this file validate query logic
import * as assert from "assert";
import { Edm, odata, TableEntity, TableTransaction } from "@azure/data-tables";
import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import { getUniqueName } from "../../testutils";
import {
  AzureDataTablesTestEntity,
  createBasicEntityForTest
} from "../models/AzureDataTablesTestEntity";
import {
  createAzureDataTablesClient,
  createTableServerForTestHttps,
  createUniquePartitionKey
} from "../utils/table.entity.test.utils";
import uuid from "uuid";
// Set true to enable debug log
configLogger(false);
// For convenience, we have a switch to control the use
// of a local Azurite instance, otherwise we need an
// ENV VAR called AZURE_TABLE_STORAGE added to mocha
// script or launch.json containing
// Azure Storage Connection String (using SAS or Key).
const testLocalAzuriteInstance = true;

describe("table Entity APIs test - using Azure/data-tables", () => {
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

  it("should find an int as a number, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("int")
    );
    const partitionKey = createUniquePartitionKey("");
    const testEntity: AzureDataTablesTestEntity =
      createBasicEntityForTest(partitionKey);

    await tableClient.createTable({ requestOptions: { timeout: 60000 } });
    const result = await tableClient.createEntity(testEntity);
    assert.ok(result.etag);

    const queryResult = await tableClient
      .listEntities<AzureDataTablesTestEntity>({
        queryOptions: {
          filter: `PartitionKey eq '${partitionKey}' and int32Field eq 54321`
        }
      })
      .next();
    assert.notStrictEqual(queryResult.value, undefined);
    await tableClient.deleteTable();
  });

  it("should find a long int, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("longint")
    );
    const partitionKey = createUniquePartitionKey("");
    const testEntity: AzureDataTablesTestEntity =
      createBasicEntityForTest(partitionKey);

    await tableClient.createTable({ requestOptions: { timeout: 60000 } });
    const result = await tableClient.createEntity(testEntity);
    assert.ok(result.etag);

    const queryResult = await tableClient
      .listEntities<AzureDataTablesTestEntity>({
        queryOptions: {
          filter: `PartitionKey eq '${partitionKey}' and int64Field eq 12345L`
        }
      })
      .next();
    assert.notStrictEqual(queryResult.value, undefined);

    await tableClient.deleteTable();
  });

  it("should find an entity using a partition key with multiple spaces, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("query1s")
    );
    const partitionKey = createUniquePartitionKey("") + " with spaces";
    const testEntity: AzureDataTablesTestEntity =
      createBasicEntityForTest(partitionKey);

    await tableClient.createTable({ requestOptions: { timeout: 60000 } });
    const result = await tableClient.createEntity(testEntity);
    assert.ok(result.etag);

    const queryResult = await tableClient
      .listEntities<AzureDataTablesTestEntity>({
        queryOptions: {
          filter: `PartitionKey eq '${partitionKey}'`
        }
      })
      .next();
    assert.notStrictEqual(queryResult.value, undefined);

    await tableClient.deleteTable();
  });

  it("should provide a complete query result when using query entities by page, @loki", async () => {
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

  it("should return the correct number of results querying with a timestamp or different SDK whitespacing behaviours, @loki", async () => {
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

  it("should return the correct number of results querying with a boolean field regardless of whitespacing behaviours, @loki", async () => {
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

  it("should return the correct number of results querying with an int64 field regardless of whitespacing behaviours, @loki", async () => {
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
      const testEntity: AzureDataTablesTestEntity = createBasicEntityForTest(
        partitionKeyForQueryTest
      );
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
      const entities = tableClient.listEntities<AzureDataTablesTestEntity>({
        queryOptions: queryTest.queryOptions,
        disableTypeConversion: true
      });
      let all: AzureDataTablesTestEntity[] = [];
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

  it("should return the correct number of results querying with a double field regardless of whitespacing behaviours, @loki", async () => {
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
      const testEntity: AzureDataTablesTestEntity = createBasicEntityForTest(
        partitionKeyForQueryTest
      );
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
      const entities = tableClient.listEntities<AzureDataTablesTestEntity>({
        queryOptions: queryTest.queryOptions
      });
      let all: AzureDataTablesTestEntity[] = [];
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

  it("should return the correct number of results querying with a double field containing a single digit number regardless of whitespacing behaviours, @loki", async () => {
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
      const testEntity: AzureDataTablesTestEntity = createBasicEntityForTest(
        partitionKeyForQueryTest
      );
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
      const entities = tableClient.listEntities<AzureDataTablesTestEntity>({
        queryOptions: queryTest.queryOptions
      });
      let all: AzureDataTablesTestEntity[] = [];
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

  it("should error on query with invalid filter string, @loki", async () => {
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
      const testEntity: AzureDataTablesTestEntity = createBasicEntityForTest(
        partitionKeyForQueryTest
      );
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
      const entities = tableClient.listEntities<AzureDataTablesTestEntity>({
        queryOptions: queryTest.queryOptions
      });

      try {
        let all: AzureDataTablesTestEntity[] = [];
        for await (const entity of entities.byPage({
          maxPageSize
        })) {
          all = [...all, ...entity];
        }
        // we should not hit this assert if the exception is generated.
        // it helps catch the cases which slip through filter validation
        assert.strictEqual(
          all.length,
          -1,
          `Failed on number of results with query ${queryTest.queryOptions.filter}.`
        );
      } catch (filterException: any) {
        assert.strictEqual(
          [400, 501].includes(filterException.statusCode),
          true,
          `Filter "${queryTest.queryOptions.filter}". Unexpected error. We got : ${filterException.message}`
        );
      }
      testsCompleted++;
    }
    assert.strictEqual(testsCompleted, queriesAndExpectedResult.length);
    await tableClient.deleteTable();
  });

  it("should correctly insert and query entities using special values using batch api", async () => {
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
      const testEntity: AzureDataTablesTestEntity = createBasicEntityForTest(
        partitionKeyForQueryTest
      );
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

      const entities = tableClient.listEntities<AzureDataTablesTestEntity>({
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (myValue eq ${valToTest})`
        }
      });
      let all: AzureDataTablesTestEntity[] = [];
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

  it("should correctly return results for query on a binary property, @loki", async () => {
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
      const entity = createBasicEntityForTest(partitionKeyForQueryTest);
      if (i % 2 === 0) {
        entity.binaryField = Buffer.from("one zero 1 0 = equals");
      }
      const result = await tableClient.createEntity(entity);
      assert.notStrictEqual(result.etag, undefined);
    }
    const maxPageSize = 10;
    let testsCompleted = 0;
    const queriesAndExpectedResult = [
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (binaryField eq binary'3131313131313131')`
        },
        expectedResult: 5
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (binaryField eq X'3131313131313131')`
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

  it("should only find guids when using guid type not plain strings, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("guidquery")
    );
    const partitionKeyForQueryTest = createUniquePartitionKey("guid");
    const totalItems = 10;
    await tableClient.createTable();
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() + 1);
    const guidEntities: AzureDataTablesTestEntity[] = [];
    for (let i = 0; i < totalItems; i++) {
      const entity = createBasicEntityForTest(partitionKeyForQueryTest);
      entity.guidField.value = uuid.v4();
      const result = await tableClient.createEntity(entity);
      assert.notStrictEqual(result.etag, undefined);
      guidEntities.push(entity);
    }
    const maxPageSize = 10;
    let testsCompleted = 0;
    const queriesAndExpectedResult = [
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (guidField eq guid'${guidEntities[1].guidField.value}')`
        },
        expectedResult: 1,
        expectedValue: guidEntities[1].guidField.value
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest})and (guidField eq ${guidEntities[1].guidField.value})`
        },
        expectedResult: 0,
        expectedValue: undefined
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and(guidField eq guid'${guidEntities[8].guidField.value}')`
        },
        expectedResult: 1,
        expectedValue: guidEntities[8].guidField.value
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest})and(guidField eq '${guidEntities[8].guidField.value}')`
        },
        expectedResult: 0,
        expectedValue: undefined
      }
    ];

    for (const queryTest of queriesAndExpectedResult) {
      const entities = tableClient.listEntities<AzureDataTablesTestEntity>({
        queryOptions: queryTest.queryOptions
      });
      let all: AzureDataTablesTestEntity[] = [];
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
          `Value ${all[0].guidField.value} was not equal to ${queryTest.expectedValue} with query ${queryTest.queryOptions.filter}`
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
});
