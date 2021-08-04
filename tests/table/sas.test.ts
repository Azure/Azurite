import * as assert from "assert";

import * as Azure from "azure-storage";
import { configLogger } from "../../src/common/Logger";
import { TableSASPermission } from "../../src/table/authentication/TableSASPermissions";
import StorageError from "../../src/table/errors/StorageError";
import TableServer from "../../src/table/TableServer";
import TableTestServerFactory from "../TableTestServerFactory";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../testutils";

// Set true to enable debug log
configLogger(false);

describe("Shared Access Signature (SAS) authentication", () => {
  const protocol = "http";
  const tableFactory = new TableTestServerFactory();

  const server: TableServer = tableFactory.createServer();

  const baseURL = `${protocol}://${server.host}:${server.port}/${EMULATOR_ACCOUNT_NAME}`;
  const connectionString =
    `DefaultEndpointsProtocol=${protocol};AccountName=${EMULATOR_ACCOUNT_NAME};` +
    `AccountKey=${EMULATOR_ACCOUNT_KEY};TableEndpoint=${baseURL};`;

  // used to generate SAS
  const tableService = Azure.createTableService(connectionString);

  const tableName: string = getUniqueName("table");

  function sasPeriod(start: number, end: number) {
    const now = new Date();
    const expiry = new Date(now);
    now.setMinutes(now.getMinutes() + start);
    expiry.setMinutes(expiry.getMinutes() + end);
    return { Start: now, Expiry: expiry };
  }

  function getSasService(policy: Azure.TableService.TableAccessPolicy) {
    const sas = tableService.generateSharedAccessSignature(tableName, {
      AccessPolicy: policy
    });

    return Azure.createTableServiceWithSas(baseURL, sas);
  }

  before(async () => {
    await server.start();
    tableService.createTable(tableName, (error, result, response) => {
      // created table for tests
    });
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  it("insertEntity with Query permission should not work @loki", (done) => {
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 5); // Skip clock skew with server

    const sas = tableService.generateSharedAccessSignature(tableName, {
      AccessPolicy: {
        Permissions: TableSASPermission.Query,
        Expiry: expiry
      }
    });

    const sasService = Azure.createTableServiceWithSas(baseURL, sas);

    const entity = {
      PartitionKey: "part1",
      RowKey: "row1",
      myValue: "value1"
    };
    sasService.insertEntity(tableName, entity, (error, result, response) => {
      assert.equal(response.statusCode, 403);
      done();
    });
  });

  it("insertEntity with Add permission should work @loki", (done) => {
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 5); // Skip clock skew with server

    const sas = tableService.generateSharedAccessSignature(tableName, {
      AccessPolicy: { Permissions: TableSASPermission.Add, Expiry: expiry }
    });

    const sasService = Azure.createTableServiceWithSas(baseURL, sas);

    const entity = {
      PartitionKey: "part1",
      RowKey: "row1",
      myValue: "value1"
    };
    sasService.insertEntity(tableName, entity, (error, result, response) => {
      assert.equal(response.statusCode, 204);
      done();
    });
  });

  it("insertEntity Add permission should work @loki", (done) => {
    const sasService = getSasService({
      Permissions: TableSASPermission.Add,
      ...sasPeriod(-1, 5)
    });

    const entity = {
      PartitionKey: "part1",
      RowKey: "row2",
      myValue: "value2"
    };

    sasService.insertEntity(tableName, entity, (error, result, response) => {
      assert.equal(response.statusCode, 204);
      done();
    });
  });

  it("insertEntity expired Add permission should not work @loki", (done) => {
    const sasService = getSasService({
      Permissions: TableSASPermission.Add,
      ...sasPeriod(-10, -5)
    });

    const entity = {
      PartitionKey: "part1",
      RowKey: "row1",
      myValue: "value1"
    };

    sasService.insertEntity(tableName, entity, (error, result, response) => {
      assert.equal(response.statusCode, 403);
      done();
    });
  });

  it("deleteEntity with Delete permission should work @loki", (done) => {
    const sasService = getSasService({
      Permissions: TableSASPermission.Delete,
      ...sasPeriod(0, 5)
    });

    const entity = {
      PartitionKey: "part1",
      RowKey: "row1",
      myValue: "value1"
    };

    sasService.deleteEntity(tableName, entity, (error, response) => {
      assert.equal(response.statusCode, 204);
      done();
    });
  });

  it("deleteEntity with Add permission should not work @loki", (done) => {
    const sasService = getSasService({
      Permissions: TableSASPermission.Add,
      ...sasPeriod(0, 5)
    });

    const entity = {
      PartitionKey: "part1",
      RowKey: "row1",
      myValue: "value1"
    };

    sasService.deleteEntity(tableName, entity, (error, response) => {
      assert.equal(response.statusCode, 403);
      done();
    });
  });

  it("Update an Entity that exists, @loki", (done) => {
    const sasService = getSasService({
      Permissions: TableSASPermission.Add + TableSASPermission.Update,
      ...sasPeriod(0, 5)
    });

    const entityInsert = {
      PartitionKey: "part1",
      RowKey: "row3",
      myValue: "oldValue"
    };
    sasService.insertEntity(
      tableName,
      entityInsert,
      (error, result, insertresponse) => {
        if (!error) {
          sasService.replaceEntity(
            tableName,
            { PartitionKey: "part1", RowKey: "row3", myValue: "newValue" },
            (updateError, updateResult, updateResponse) => {
              if (!updateError) {
                assert.equal(updateResponse.statusCode, 204); // Precondition succeeded
                done();
              } else {
                assert.ifError(updateError);
                done();
              }
            }
          );
        } else {
          assert.ifError(error);
          done();
        }
      }
    );
  });

  it("Update an Entity without update permission, @loki", (done) => {
    const sasService = getSasService({
      Permissions: TableSASPermission.Add,
      ...sasPeriod(0, 5)
    });

    sasService.replaceEntity(
      tableName,
      { PartitionKey: "part1", RowKey: "row4", myValue: "newValue" },
      (updateError, updateResult, updateResponse) => {
        const castUpdateStatusCode = (updateError as StorageError).statusCode;
        if (updateError) {
          assert.equal(castUpdateStatusCode, 403);
          done();
        } else {
          assert.fail("Test failed to throw the right Error" + updateError);
        }
      }
    );
  });

  it("Operation using SAS should fail if ACL generating the SAS no longer allow the operation, @loki", (done) => {
    const tableAcl = {
      "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=": {
        Permissions: "raud",
        Expiry: new Date("2021-12-31T11:22:33.4567890Z"),
        Start: new Date("2017-12-31T11:22:33.4567890Z")
      }
    };

    tableService.setTableAcl(tableName, tableAcl, (error, result, response) => {
      if (error) {
        assert.ifError(error);
      }

      const sas = tableService.generateSharedAccessSignature(tableName, { Id: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=",
        AccessPolicy: { Permissions: "raud", Expiry: new Date("2021-12-31T11:22:33.4567890Z"),
        Start: new Date("2017-12-31T11:22:33.4567890Z") }
      });

      const sasService = Azure.createTableServiceWithSas(baseURL, sas);

      const entity = {
        PartitionKey: "part1",
        RowKey: "row1",
        myValue: "value1"
      };

      // tslint:disable-next-line: no-shadowed-variable
      sasService.insertEntity(tableName, entity, (error) => {
        if (error) {
          assert.ifError(error);
        }
        // change ACL with the same id such that update ("u") is now disabled
        const newTableAcl = {
          "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=": {
            Permissions: "r",
            Expiry: new Date("2021-12-31T11:22:33.4567890Z"),
            Start: new Date("2017-12-31T11:22:33.4567890Z")
          }
        };
        // tslint:disable-next-line: no-shadowed-variable
        tableService.setTableAcl(tableName, newTableAcl, (error) => {
          if (error) {
            assert.ifError(error);
          }

          const entity2 = {
            PartitionKey: "part2",
            RowKey: "row2",
            myValue: "value2"
          };

          // tslint:disable-next-line: no-shadowed-variable
          sasService.insertEntity(tableName, entity2, (error) => {
            const errorCode = (error as StorageError).statusCode;
            assert.strictEqual(errorCode, 403);
            done();
          });
        });
      });
    });
  });

  it("Update an Entity that does not exist, @loki", (done) => {
    const sasService = getSasService({
      Permissions: TableSASPermission.Update,
      ...sasPeriod(0, 5)
    });

    sasService.replaceEntity(
      tableName,
      { PartitionKey: "part1", RowKey: "row4", myValue: "newValue" },
      (updateError, updateResult, updateResponse) => {
        const castUpdateStatusCode = (updateError as StorageError).statusCode;
        if (updateError) {
          assert.equal(castUpdateStatusCode, 404);
          done();
        } else {
          assert.fail("Test failed to throw the right Error" + updateError);
        }
      }
    );
  });
});
