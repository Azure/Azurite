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
  AzureDataTablesTestEntityFactory,
  TableTestEntity
} from "../models/AzureDataTablesTestEntityFactory";
import {
  createAzureDataTablesClient,
  createTableServerForTestHttps,
  createUniquePartitionKey,
  HOST,
  PORT
} from "../utils/table.entity.test.utils";
import { RestError } from "@azure/core-http";

// Set true to enable debug log
configLogger(false);
// For convenience, we have a switch to control the use
// of a local Azurite instance, otherwise we need an
// ENV VAR added to mocha
// script or launch.json containing
// Azure Storage Connection String (using SAS or Key).
const testLocalAzuriteInstance = true;

const entityFactory = new AzureDataTablesTestEntityFactory();

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

  it("01. Batch API should serialize errors according to group transaction spec, @loki", async () => {
    const partitionKey = createUniquePartitionKey("");
    const testEntities: TableTestEntity[] = [
      entityFactory.createBasicEntityForTest(partitionKey),
      entityFactory.createBasicEntityForTest(partitionKey),
      entityFactory.createBasicEntityForTest(partitionKey)
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

  it("02. Batch API should reject request with more than 100 transactions, @loki", async () => {
    const partitionKey = createUniquePartitionKey("");
    const tableName100: string = getUniqueName("datatables");
    const testEntities: TableTestEntity[] = [];
    const TOO_MANY_REQUESTS = 101;
    while (testEntities.length < TOO_MANY_REQUESTS) {
      testEntities.push(entityFactory.createBasicEntityForTest(partitionKey));
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

  it("03. Batch API should rollback insert Entity transactions, @loki", async () => {
    const partitionKey = createUniquePartitionKey("");
    const tableNameBatchError: string = getUniqueName("datatables");
    const testEntities: TableTestEntity[] = [
      entityFactory.createBasicEntityForTest(partitionKey),
      entityFactory.createBasicEntityForTest(partitionKey),
      entityFactory.createBasicEntityForTest(partitionKey)
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

    try {
      const result = await tableClientrollback.submitTransaction(
        transaction.actions
      );
      assert.ok(result.subResponses[0].rowKey);
    } catch (err: any) {
      const restErr = err as RestError;
      assert.strictEqual(
        restErr.statusCode,
        202,
        `Should not have got status code ${restErr.statusCode} on first transaction.`
      );
    }

    testEntities[1].myValue = "ShouldNotHaveChanged";
    const transaction2 = new TableTransaction();
    for (const testEntity of testEntities) {
      transaction2.createEntity(testEntity);
    }

    try {
      const result2 = await tableClientrollback.submitTransaction(
        transaction2.actions
      );
      assert.ok(result2.subResponses[0].rowKey);
    } catch (err: any) {
      const restErr = err as RestError;
      assert.strictEqual(
        restErr.statusCode,
        409,
        "Did not get expected 409 (EntityAlreadyExists) error."
      );
    }

    try {
      const shouldNotExist =
        await tableClientrollback.getEntity<TableTestEntity>(
          testEntities[1].partitionKey,
          testEntities[1].rowKey
        );
      assert.strictEqual(
        shouldNotExist.myValue,
        "value1",
        "We should not have changed the value!"
      );
    } catch (err: any) {
      const restErr2 = err as RestError;
      assert.strictEqual(
        restErr2.statusCode,
        202,
        "We did not expect the entity to have been changed."
      );
    }
    await tableClientrollback.deleteTable();
  });

  it("04. Batch API should rollback delete Entity transactions, @loki", async () => {
    const partitionKey = createUniquePartitionKey("");
    const tableNameDeleteError: string = getUniqueName("datatables");
    const testEntities: TableTestEntity[] = [
      entityFactory.createBasicEntityForTest(partitionKey),
      entityFactory.createBasicEntityForTest(partitionKey),
      entityFactory.createBasicEntityForTest(partitionKey)
    ];

    const tableClientrollback = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      tableNameDeleteError
    );

    await tableClientrollback.createTable();

    const transaction = new TableTransaction();
    for (const testEntity of testEntities) {
      transaction.createEntity(testEntity);
    }

    try {
      const result = await tableClientrollback.submitTransaction(
        transaction.actions
      );
      assert.ok(result.subResponses[0].rowKey);
    } catch (err: any) {
      assert.ifError(err); // should not have an error here
    }

    const transactionDelete = new TableTransaction();

    transactionDelete.deleteEntity(
      testEntities[0].partitionKey,
      testEntities[0].rowKey
    );
    transactionDelete.deleteEntity(
      testEntities[1].partitionKey,
      testEntities[1].rowKey
    );
    transactionDelete.createEntity(testEntities[2]);

    try {
      const resultDelete = await tableClientrollback.submitTransaction(
        transactionDelete.actions
      );
      assert.strictEqual(resultDelete.status, 202);
    } catch (err: any) {
      const restErr = err as RestError;
      assert.strictEqual(
        restErr.statusCode,
        409,
        "Did not get expected entity already exists error."
      );
    }

    try {
      const shouldExist = await tableClientrollback.getEntity<TableTestEntity>(
        testEntities[0].partitionKey,
        testEntities[0].rowKey
      );
      assert.notStrictEqual(shouldExist, null, "We have an entity.");
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

  it("05. Batch API should rollback update Entity transactions, @loki", async () => {
    const partitionKey = createUniquePartitionKey("");
    const tableNameDeleteError: string = getUniqueName("datatables");
    const testEntities: TableTestEntity[] = [
      entityFactory.createBasicEntityForTest(partitionKey),
      entityFactory.createBasicEntityForTest(partitionKey),
      entityFactory.createBasicEntityForTest(partitionKey)
    ];

    const tableClientrollback = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      tableNameDeleteError
    );

    await tableClientrollback.createTable();

    const transaction = new TableTransaction();
    for (const testEntity of testEntities) {
      transaction.createEntity(testEntity);
    }

    try {
      const result = await tableClientrollback.submitTransaction(
        transaction.actions
      );
      assert.ok(result.subResponses[0].rowKey);
    } catch (err: any) {
      assert.ifError(err); // should not have an error here
    }

    const transactionUpdateThenError = new TableTransaction();

    testEntities[0].myValue = "a new value";
    testEntities[1].myValue = "a new value";

    transactionUpdateThenError.updateEntity(testEntities[0]);
    transactionUpdateThenError.updateEntity(testEntities[1]);
    transactionUpdateThenError.createEntity(testEntities[2]);

    try {
      const resultDelete = await tableClientrollback.submitTransaction(
        transactionUpdateThenError.actions
      );
      assert.strictEqual(resultDelete.status, 202);
    } catch (err: any) {
      const restErr = err as RestError;
      assert.strictEqual(
        restErr.statusCode,
        409,
        "Did not get expected entity already exists error."
      );
    }

    try {
      const shouldExist = await tableClientrollback.getEntity<TableTestEntity>(
        testEntities[0].partitionKey,
        testEntities[0].rowKey
      );
      assert.notStrictEqual(shouldExist, null, "We have an entity.");
      assert.notStrictEqual(
        shouldExist.myValue,
        "a new value",
        "Update entity action was not rolled back!"
      );
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

  it("06. Batch API should rollback upsert Entity transactions, @loki", async () => {
    const partitionKey = createUniquePartitionKey("");
    const tableNameDeleteError: string = getUniqueName("datatables");
    const testEntities: TableTestEntity[] = [
      entityFactory.createBasicEntityForTest(partitionKey),
      entityFactory.createBasicEntityForTest(partitionKey),
      entityFactory.createBasicEntityForTest(partitionKey)
    ];

    const tableClientrollback = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      tableNameDeleteError
    );

    await tableClientrollback.createTable();

    const transaction = new TableTransaction();
    for (const testEntity of testEntities) {
      transaction.createEntity(testEntity);
    }

    try {
      const result = await tableClientrollback.submitTransaction(
        transaction.actions
      );
      assert.ok(result.subResponses[0].rowKey);
    } catch (err: any) {
      assert.ifError(err); // should not have an error here
    }

    const transactionUpdateThenError = new TableTransaction();

    testEntities[0].myValue = "a new value";
    testEntities[1].myValue = "a new value";
    const newUpsertEntity =
      entityFactory.createBasicEntityForTest(partitionKey);
    newUpsertEntity.myValue = "ephemeral";
    transactionUpdateThenError.upsertEntity(testEntities[0]);
    transactionUpdateThenError.upsertEntity(testEntities[1]);
    transactionUpdateThenError.upsertEntity(newUpsertEntity);
    transactionUpdateThenError.createEntity(testEntities[2]);

    try {
      const resultDelete = await tableClientrollback.submitTransaction(
        transactionUpdateThenError.actions
      );
      assert.strictEqual(resultDelete.status, 202);
    } catch (err: any) {
      const restErr = err as RestError;
      assert.strictEqual(
        restErr.statusCode,
        409,
        "Did not get expected entity already exists error."
      );
    }

    try {
      const shouldExist = await tableClientrollback.getEntity<TableTestEntity>(
        testEntities[0].partitionKey,
        testEntities[0].rowKey
      );
      assert.notStrictEqual(shouldExist, null, "We have an entity.");
      assert.notStrictEqual(
        shouldExist.myValue,
        "a new value",
        "Update entity action was not rolled back!"
      );
    } catch (err: any) {
      const restErr2 = err as RestError;
      assert.strictEqual(
        restErr2.statusCode,
        404,
        "We expected an entity not found error."
      );
    }

    try {
      const shouldNotExist =
        await tableClientrollback.getEntity<TableTestEntity>(
          newUpsertEntity.partitionKey,
          newUpsertEntity.rowKey
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

  it("07. Batch API should return valid batch failure index for Azure.Data.Tables, @loki", async () => {
    const partitionKey = createUniquePartitionKey("");
    const tableNameDeleteError: string = getUniqueName("datatables");
    const testEntities: TableTestEntity[] = [
      entityFactory.createBasicEntityForTest(partitionKey),
      entityFactory.createBasicEntityForTest(partitionKey),
      entityFactory.createBasicEntityForTest(partitionKey)
    ];

    const tableClientrollback = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      tableNameDeleteError
    );

    await tableClientrollback.createTable();

    const transaction = new TableTransaction();
    for (const testEntity of testEntities) {
      transaction.createEntity(testEntity);
    }
    transaction.deleteEntity(partitionKey, getUniqueName("ThisShouldNotExist"));
    let errorCaught = false;
    try {
      const result = await tableClientrollback.submitTransaction(
        transaction.actions
      );
      assert.ok(result.subResponses[0].rowKey);
    } catch (err: any) {
      errorCaught = true;
      assert.strictEqual(
        err.message[0],
        "3",
        "We did not get the expected entity ID in the error response"
      );
    }
    assert.strictEqual(
      errorCaught,
      true,
      "Did not catch the expected error, test should not pass!"
    );

    await tableClientrollback.deleteTable();
  });

  it("08. Batch API Etag should be rolled back after transaction failure on update, @loki", async () => {
    const partitionKey = createUniquePartitionKey("");
    const tableNameDeleteError: string = getUniqueName("datatables");
    const singleTestEntity =
      entityFactory.createBasicEntityForTest(partitionKey);

    const tableClientrollback = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      tableNameDeleteError
    );

    await tableClientrollback.createTable();

    const singleEntityResult = await tableClientrollback.createEntity(
      singleTestEntity
    );

    const testEntities: TableTestEntity[] = [
      entityFactory.createBasicEntityForTest(partitionKey),
      entityFactory.createBasicEntityForTest(partitionKey),
      entityFactory.createBasicEntityForTest(partitionKey)
    ];

    const transaction = new TableTransaction();
    for (const testEntity of testEntities) {
      transaction.createEntity(testEntity);
    }

    try {
      const result = await tableClientrollback.submitTransaction(
        transaction.actions
      );
      assert.ok(result.subResponses[0].rowKey);
    } catch (err: any) {
      assert.ifError(err); // should not have an error here
    }

    const transactionUpdateThenError = new TableTransaction();

    testEntities[0] = singleTestEntity;

    testEntities[0].myValue = "a new value";
    testEntities[1].myValue = "a new value";

    transactionUpdateThenError.updateEntity(testEntities[0]);
    transactionUpdateThenError.updateEntity(testEntities[1]);
    transactionUpdateThenError.createEntity(testEntities[2]);

    try {
      const resultDelete = await tableClientrollback.submitTransaction(
        transactionUpdateThenError.actions
      );
      assert.strictEqual(resultDelete.status, 202);
    } catch (err: any) {
      const restErr = err as RestError;
      assert.strictEqual(
        restErr.statusCode,
        409,
        "Did not get expected entity already exists error."
      );
    }

    try {
      const shouldExist = await tableClientrollback.getEntity<TableTestEntity>(
        testEntities[0].partitionKey,
        testEntities[0].rowKey
      );
      assert.notStrictEqual(shouldExist, null, "We have an entity.");
      assert.notStrictEqual(
        shouldExist.myValue,
        "a new value",
        "Update entity action was not rolled back!"
      );
      assert.strictEqual(
        shouldExist.etag,
        singleEntityResult.etag,
        "Update entity did not roll back eTag!"
      );
    } catch (err: any) {
      const restErr2 = err as RestError;
      assert.strictEqual(
        restErr2.statusCode,
        404,
        `We expected an entity not found error, but got \"${restErr2.message}\"`
      );
    }
    await tableClientrollback.deleteTable();
  });

  it("09. Batch API should fail to insert duplicate Entity with correct 400 Status and InvalidDuplicateRow error, @loki", async () => {
    const partitionKey = createUniquePartitionKey("");
    const tableNameBatchError: string = getUniqueName("datatables");
    const myDupTestEntity = entityFactory.createBasicEntityForTest(partitionKey);
    const testEntities: TableTestEntity[] = [
      entityFactory.createBasicEntityForTest(partitionKey),
      myDupTestEntity,
      myDupTestEntity
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

    try {
      const result = await tableClientrollback.submitTransaction(
        transaction.actions
      );
      assert.ok(result.subResponses[0].rowKey);
    } catch (err: any) {
      const restErr = err as RestError;
      assert.strictEqual(
        restErr.statusCode,
        400,
        "Did not get expected 409 (InvalidDuplicateRow) error."
      );
    }

    await tableClientrollback.deleteTable();
  });
});
