import * as assert from "assert";

import * as Azure from "azure-storage";
import { configLogger } from "../../src/common/Logger";
import { TableSASPermission } from "../../src/table/authentication/TableSASPermissions";
import StorageError from "../../src/table/errors/StorageError";
import TableServer from "../../src/table/TableServer";
import TableTestServerFactory from "./utils/TableTestServerFactory";
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
    tableService.removeAllListeners();
    await server.close();
  });

  it("1. insertEntity with Query permission should not work @loki", (done) => {
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
      assert.strictEqual(
        response.statusCode,
        403,
        "did not get expected HTTP status 403"
      );
      done();
    });
  });

  it("2. insertEntity with Add permission should work @loki", (done) => {
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

  it("3. insertEntity Add permission should work @loki", (done) => {
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

  it("4. insertEntity expired Add permission should not work @loki", (done) => {
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

  it("5. deleteEntity with Delete permission should work @loki", (done) => {
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

  it("6. deleteEntity with Add permission should not work @loki", (done) => {
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

  it("7. Update an Entity that exists, @loki", (done) => {
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

  it("8. Update an Entity without update permission, @loki", (done) => {
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
          assert.strictEqual(castUpdateStatusCode, 403);
        } else {
          assert.fail("Test failed to throw the right Error" + updateError);
        }
        done();
      }
    );
  });

  it("9. Operation using SAS should fail if ACL generating the SAS no longer allow the operation, @loki", (done) => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    const tableAcl = {
      "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=": {
        Permissions: "raud",
        Expiry: tmr,
        Start: new Date("2017-12-31T11:22:33.4567890Z")
      }
    };

    tableService.setTableAcl(tableName, tableAcl, (error, result, response) => {
      if (error) {
        assert.ifError(error);
      }

      const sas = tableService.generateSharedAccessSignature(tableName, {
        Id: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=",
        AccessPolicy: {
          Permissions: "raud",
          Expiry: tmr,
          Start: new Date("2017-12-31T11:22:33.4567890Z")
        }
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
            Expiry: tmr,
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

  it("10. Updates an Entity that does not exist, @loki", (done) => {
    const sasService = getSasService({
      Permissions: TableSASPermission.Update,
      ...sasPeriod(0, 5)
    });

    // this upserts, so we expect success
    sasService.replaceEntity(
      tableName,
      { PartitionKey: "part1", RowKey: "row4", myValue: "newValue" },
      (updateError, updateResult, updateResponse) => {
        if (updateError) {
          const castUpdateStatusCode = (updateError as StorageError).statusCode;
          assert.fail(
            "Test failed and had HTTP error : " + castUpdateStatusCode
          );
        } else {
          assert.strictEqual(
            updateResponse.statusCode,
            204,
            "We did not get the expected status code : " +
              updateResponse.statusCode
          );
        }
        done();
      }
    );
  });
});
