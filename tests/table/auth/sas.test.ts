import * as assert from "assert";

import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import { getUniqueName } from "../../testutils";
import {
  createConnectionStringForTest,
  createCredentialForTest,
  createTableServerForTest,
  getBaseUrlForTest
} from "../utils/table.entity.test.utils";
import {
  AzureSASCredential,
  generateTableSas,
  TableClient,
  TableServiceClient
} from "@azure/data-tables";

// Set true to enable debug log
configLogger(false);
// For convenience, we have a switch to control the use
// of a local Azurite instance, otherwise we need an
// ENV VAR called AZURE_TABLE_STORAGE added to mocha
// script or launch.json containing
// Azure Storage Connection String (using SAS or Key).
const testLocalAzuriteInstance = true;

function sasPeriod(start: number, end: number) {
  const now = new Date();
  const expiry = new Date(now);
  now.setMinutes(now.getMinutes() + start);
  expiry.setMinutes(expiry.getMinutes() + end);
  return { startsOn: now, expiresOn: expiry };
}

describe("Shared Access Signature (SAS) authentication", () => {
  let server: TableServer;

  // used to generate SAS
  const tableService = TableServiceClient.fromConnectionString(
    createConnectionStringForTest(testLocalAzuriteInstance),
    { allowInsecureConnection: true }
  );

  // this test file is using the older callback based SDK,
  // and so uses a clunkier table creation in each test.
  // This avoids us hanging when trying to close out the tests.
  before(async () => {
    server = createTableServerForTest();
    await server.start();
  });

  after(async () => {
    await server.close();
  });

  it("1. insertEntity with Query permission should not work @loki", async () => {
    // Use table name include upper case letter to validate SAS signature should calculate from lower case table name (Issue #1359)
    const tableName: string = getUniqueName("Sas1");
    await tableService.createTable(tableName);
    // created table for tests
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 5); // Skip clock skew with server
    const sas = generateTableSas(tableName, createCredentialForTest(), {
      permissions: {
        query: true
      },
      expiresOn: expiry
    });

    const sasService = new TableClient(
      getBaseUrlForTest(),
      tableName,
      new AzureSASCredential(sas),
      { allowInsecureConnection: true }
    );

    const entity = {
      partitionKey: "part1",
      rowKey: "row1",
      myValue: "value1"
    };
    try {
      await sasService.createEntity(entity);
    } catch (error) {
      assert.strictEqual(
        error.details.errorCode,
        "AuthorizationPermissionMismatch",
        `Had error : ${error.message}`
      );
    }
  });

  it("2. insertEntity with Add permission should work @loki", async () => {
    const tableName: string = getUniqueName("sas2");
    await tableService.createTable(tableName);
    // created table for tests
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 5); // Skip clock skew with server

    const sas = generateTableSas(tableName, createCredentialForTest(), {
      permissions: {
        add: true
      },
      expiresOn: expiry
    });

    const sasService = new TableClient(
      getBaseUrlForTest(),
      tableName,
      new AzureSASCredential(sas),
      { allowInsecureConnection: true }
    );

    const entity = {
      partitionKey: "part1",
      rowKey: "row1",
      myValue: "value1"
    };

    await sasService.createEntity(entity);
  });

  it("3. insertEntity Add permission should work @loki", async () => {
    const tableName: string = getUniqueName("sas3");
    await tableService.createTable(tableName);
    const sas = generateTableSas(tableName, createCredentialForTest(), {
      permissions: {
        add: true
      },
      ...sasPeriod(-1, 5)
    });

    const sasService = new TableClient(
      getBaseUrlForTest(),
      tableName,
      new AzureSASCredential(sas),
      { allowInsecureConnection: true }
    );

    const entity = {
      partitionKey: "part1",
      rowKey: "row2",
      myValue: "value2"
    };

    await sasService.createEntity(entity);
  });

  it("4. insertEntity expired Add permission should not work @loki", async () => {
    const tableName: string = getUniqueName("sas4");
    await tableService.createTable(tableName);
    const sas = generateTableSas(tableName, createCredentialForTest(), {
      permissions: {
        add: true
      },
      ...sasPeriod(-10, -5)
    });

    const sasService = new TableClient(
      getBaseUrlForTest(),
      tableName,
      new AzureSASCredential(sas),
      { allowInsecureConnection: true }
    );

    const entity = {
      partitionKey: "part1",
      rowKey: "row1",
      myValue: "value1"
    };

    try {
      await sasService.createEntity(entity);
      assert.fail("Created entity");
    } catch (_) {
      /* test success */
    }
  });

  it("5. deleteEntity with Delete permission should work @loki", async () => {
    const tableName: string = getUniqueName("sas5");
    await tableService.createTable(tableName);
    const sasInsert = generateTableSas(tableName, createCredentialForTest(), {
      permissions: {
        add: true
      },
      ...sasPeriod(-1, 5)
    });

    const sasServiceInsert = new TableClient(
      getBaseUrlForTest(),
      tableName,
      new AzureSASCredential(sasInsert),
      { allowInsecureConnection: true }
    );

    const sasDelete = generateTableSas(tableName, createCredentialForTest(), {
      permissions: {
        delete: true
      },
      ...sasPeriod(0, 5)
    });

    const sasServiceDelete = new TableClient(
      getBaseUrlForTest(),
      tableName,
      new AzureSASCredential(sasDelete),
      { allowInsecureConnection: true }
    );

    const entity = {
      partitionKey: "part1",
      rowKey: "row1",
      myValue: "value1"
    };
    await sasServiceInsert.createEntity(entity);

    await sasServiceDelete.deleteEntity(entity.partitionKey, entity.rowKey);
  });

  it("6. deleteEntity with Add permission should not work @loki", async () => {
    const tableName: string = getUniqueName("sas6");
    await tableService.createTable(tableName);
    // created table for tests
    const sas = generateTableSas(tableName, createCredentialForTest(), {
      permissions: {
        add: true
      },
      ...sasPeriod(-10, 5)
    });

    const sasService = new TableClient(
      getBaseUrlForTest(),
      tableName,
      new AzureSASCredential(sas),
      { allowInsecureConnection: true }
    );

    const entity = {
      partitionKey: "part1",
      rowKey: "row1",
      myValue: "value1"
    };

    await sasService.createEntity(entity);

    try {
      await sasService.deleteEntity(entity.partitionKey, entity.rowKey);
      assert.fail("Deleted entity");
    } catch (_) {
      /* test success */
    }
  });

  it("7. Update an Entity that exists, @loki", async () => {
    const tableName: string = getUniqueName("sas7");
    await tableService.createTable(tableName);
    const sas = generateTableSas(tableName, createCredentialForTest(), {
      permissions: {
        add: true,
        update: true
      },
      ...sasPeriod(-10, 5)
    });

    const sasService = new TableClient(
      getBaseUrlForTest(),
      tableName,
      new AzureSASCredential(sas),
      { allowInsecureConnection: true }
    );

    const entityInsert = {
      partitionKey: "part1",
      rowKey: "row3",
      myValue: "oldValue"
    };
    await sasService.createEntity(entityInsert);

    await sasService.updateEntity({
      partitionKey: "part1",
      rowKey: "row3",
      myValue: "newValue"
    });
  });

  it("8. Update an Entity without update permission, @loki", async () => {
    const tableName: string = getUniqueName("sas8");

    await tableService.createTable(tableName);
    const sas = generateTableSas(tableName, createCredentialForTest(), {
      permissions: {
        add: true,
        update: true
      },
      ...sasPeriod(-10, 5)
    });

    const sasService = new TableClient(
      getBaseUrlForTest(),
      tableName,
      new AzureSASCredential(sas),
      { allowInsecureConnection: true }
    );

    const entityInsert = {
      partitionKey: "part1",
      rowKey: "row3",
      myValue: "oldValue"
    };
    await sasService.createEntity(entityInsert);

    try {
      await sasService.updateEntity({
        partitionKey: "part1",
        rowKey: "row3",
        myValue: "newValue"
      });
      assert.fail("Test failed to throw the right Error");
    } catch (_) {
      /* test success */
    }
  });

  it("9. Operation using SAS should fail if ACL generating the SAS no longer allow the operation, @loki", async () => {
    const tableName: string = getUniqueName("sas9");
    await tableService.createTable(tableName);
    // created table for tests
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    const tableAcl = {
      id: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=",
      accessPolicy: {
        permission: "raud",
        expiry: tmr,
        start: new Date("2017-12-31T11:22:33.4567890Z")
      }
    };
    const tableClient = TableClient.fromConnectionString(
      createConnectionStringForTest(testLocalAzuriteInstance),
      tableName,
      { allowInsecureConnection: true }
    );

    try {await tableClient.setAccessPolicy([tableAcl]);
    } catch (e) {
      throw e;
    }

    const sas = generateTableSas(tableName, createCredentialForTest(), {
      permissions: {
        add: true,
        update: true
      },
      identifier: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=",
      expiresOn: tmr,
      startsOn: new Date("2017-12-31T11:22:33.4567890Z")
    });

    const sasService = new TableClient(
      getBaseUrlForTest(),
      tableName,
      new AzureSASCredential(sas),
      { allowInsecureConnection: true }
    );

    const entity = {
      partitionKey: "part1",
      rowKey: "row1",
      myValue: "value1"
    };

    await sasService.createEntity(entity);

    // change ACL with the same id such that update ("u") is now disabled
    const newTableAcl = {
      id: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=",
      accessPolicy: {
        permission: "r",
        expiry: tmr,
        start: new Date("2017-12-31T11:22:33.4567890Z")
      }
    };

    await tableClient.setAccessPolicy([newTableAcl]);

    const entity2 = {
      partitionKey: "part2",
      rowKey: "row2",
      myValue: "value2"
    };

    try {
      await sasService.createEntity(entity2);
      assert.fail("could create while acl no longer allows");
    } catch (_) {
      /* Test success */
    }
  });

  // it("10. Updates an Entity that does not exist, @loki", (done) => {
  //   const tableName: string = getUniqueName("sas10");
  //   tableService.createTable(tableName, (error, result, response) => {
  //     // created table for tests
  //     const sasService = getSasService(
  //       {
  //         Permissions: TableSASPermission.Update,
  //         ...sasPeriod(0, 5)
  //       },
  //       tableName
  //     );

  //     // this upserts, so we expect success
  //     sasService.insertOrReplaceEntity(
  //       tableName,
  //       { PartitionKey: "part1", RowKey: "row4", myValue: "newValue" },
  //       (updateError, updateResult, updateResponse) => {
  //         if (updateError) {
  //           const castUpdateStatusCode = (updateError as StorageError)
  //             .statusCode;
  //           assert.fail(
  //             "Test failed and had HTTP error : " + castUpdateStatusCode
  //           );
  //         } else {
  //           assert.strictEqual(
  //             updateResponse.statusCode,
  //             204,
  //             "We did not get the expected status code : " +
  //               updateResponse.statusCode
  //           );
  //         }
  //         done();
  //       }
  //     );
  //   });
  // });
});
