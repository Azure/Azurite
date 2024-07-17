import * as assert from "assert";
import * as Azure from "azure-storage";

import { configLogger } from "../../../src/common/Logger";
import StorageError from "../../../src/table/errors/StorageError";
import TableServer from "../../../src/table/TableServer";
import {
  HeaderConstants,
  TABLE_API_VERSION
} from "../../../src/table/utils/constants";
import {
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  overrideRequest,
  restoreBuildRequestOptions
} from "../../testutils";
import {
  HOST,
  PROTOCOL,
  PORT,
  createConnectionStringForTest,
  createTableServerForTest
} from "../utils/table.entity.test.utils";

// Set true to enable debug log
configLogger(false);
// For convenience, we have a switch to control the use
// of a local Azurite instance, otherwise we need an
// ENV VAR called AZURE_TABLE_STORAGE added to mocha
// script or launch.json containing
// Azure Storage Connection String (using SAS or Key).
const testLocalAzuriteInstance = true;

describe("table APIs test", () => {
  let server: TableServer;
  const tableService = Azure.createTableService(
    createConnectionStringForTest(testLocalAzuriteInstance)
  );
  tableService.enableGlobalHttpAgent = true;

  let tableName: string = getUniqueName("table");

  const requestOverride = { headers: {} };

  before(async () => {
    overrideRequest(requestOverride, tableService);
    server = createTableServerForTest();
    tableName = getUniqueName("table");
    await server.start();
  });

  after(async () => {
    restoreBuildRequestOptions(tableService);
    tableService.removeAllListeners();
    await server.close();
  });

  it("createTable, prefer=return-no-content, accept=application/json;odata=minimalmetadata @loki", (done) => {
    /* Azure Storage Table SDK doesn't support customize Accept header and Prefer header,
      thus we workaround this by override request headers to test following 3 OData levels responses.
    - application/json;odata=nometadata
    - application/json;odata=minimalmetadata
    - application/json;odata=fullmetadata
    */
    requestOverride.headers = {
      Prefer: "return-no-content",
      accept: "application/json;odata=minimalmetadata"
    };

    tableService.createTable(tableName, (error, result, response) => {
      if (!error) {
        assert.strictEqual(result.TableName, tableName);
        assert.strictEqual(result.statusCode, 204);
        const headers = response.headers!;
        assert.strictEqual(headers["x-ms-version"], TABLE_API_VERSION);
        assert.deepStrictEqual(response.body, "");
      }
      done();
    });
  });

  it("createTable, prefer=return-content, accept=application/json;odata=fullmetadata @loki", (done) => {
    /* Azure Storage Table SDK doesn't support customize Accept header and Prefer header,
      thus we workaround this by override request headers to test following 3 OData levels responses.
    - application/json;odata=nometadata
    - application/json;odata=minimalmetadata
    - application/json;odata=fullmetadata
    */
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };

    tableService.createTable(tableName, (error, result, response) => {
      if (!error) {
        assert.strictEqual(result.TableName, tableName);
        assert.strictEqual(result.statusCode, 201);
        const headers = response.headers!;
        assert.strictEqual(headers["x-ms-version"], TABLE_API_VERSION);
        const bodies = response.body! as any;
        assert.deepStrictEqual(bodies.TableName, tableName);
        assert.deepStrictEqual(
          bodies["odata.type"],
          `${EMULATOR_ACCOUNT_NAME}.Tables`
        );
        assert.deepStrictEqual(
          bodies["odata.metadata"],
          `${PROTOCOL}://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}/$metadata#Tables/@Element`
        );
        assert.deepStrictEqual(
          bodies["odata.id"],
          `${PROTOCOL}://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}/Tables(${tableName})`
        );
        assert.deepStrictEqual(
          bodies["odata.editLink"],
          `Tables(${tableName})`
        );
      }
      done();
    });
  });

  it("createTable, prefer=return-content, accept=application/json;odata=minimalmetadata @loki", (done) => {
    // TODO
    done();
  });

  it("createTable, prefer=return-content, accept=application/json;odata=nometadata @loki", (done) => {
    // TODO
    done();
  });

  it("queryTable, accept=application/json;odata=fullmetadata @loki", (done) => {
    /* Azure Storage Table SDK doesn't support customize Accept header and Prefer header,
      thus we workaround this by override request headers to test following 3 OData levels responses.
    - application/json;odata=nometadata
    - application/json;odata=minimalmetadata
    - application/json;odata=fullmetadata
    */
    requestOverride.headers = {
      accept: "application/json;odata=fullmetadata"
    };

    tableService.listTablesSegmented(
      null as any,
      { maxResults: 20 },
      (error, result, response) => {
        assert.deepStrictEqual(error, null);

        assert.strictEqual(response.statusCode, 200);
        const headers = response.headers!;
        assert.strictEqual(headers["x-ms-version"], TABLE_API_VERSION);
        const bodies = response.body! as any;
        assert.deepStrictEqual(
          bodies["odata.metadata"],
          `${PROTOCOL}://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}/$metadata#Tables`
        );
        assert.ok(bodies.value[0].TableName);
        assert.ok(bodies.value[0]["odata.type"]);
        assert.ok(bodies.value[0]["odata.id"]);
        assert.ok(bodies.value[0]["odata.editLink"]);

        done();
      }
    );
  });

  it("queryTable, accept=application/json;odata=minimalmetadata @loki", (done) => {
    /* Azure Storage Table SDK doesn't support customize Accept header and Prefer header,
      thus we workaround this by override request headers to test following 3 OData levels responses.
    - application/json;odata=nometadata
    - application/json;odata=minimalmetadata
    - application/json;odata=fullmetadata
    */
    requestOverride.headers = {
      accept: "application/json;odata=minimalmetadata"
    };

    tableService.listTablesSegmented(null as any, (error, result, response) => {
      if (!error) {
        assert.strictEqual(response.statusCode, 200);
        const headers = response.headers!;
        assert.strictEqual(headers["x-ms-version"], TABLE_API_VERSION);
        const bodies = response.body! as any;
        assert.deepStrictEqual(
          bodies["odata.metadata"],
          `${PROTOCOL}://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}/$metadata#Tables`
        );
        assert.ok(bodies.value[0].TableName);
      }
      done();
    });
  });

  it("queryTable, accept=application/json;odata=nometadata @loki", (done) => {
    /* Azure Storage Table SDK doesn't support customize Accept header and Prefer header,
      thus we workaround this by override request headers to test following 3 OData levels responses.
    - application/json;odata=nometadata
    - application/json;odata=minimalmetadata
    - application/json;odata=fullmetadata
    */
    requestOverride.headers = {
      accept: "application/json;odata=nometadata"
    };

    tableService.listTablesSegmented(null as any, (error, result, response) => {
      if (!error) {
        assert.strictEqual(response.statusCode, 200);
        const headers = response.headers!;
        assert.strictEqual(headers["x-ms-version"], TABLE_API_VERSION);
        const bodies = response.body! as any;
        assert.ok(bodies.value[0].TableName);
      }
      done();
    });
  });

  it("deleteTable that exists, @loki", (done) => {
    /*
    https://docs.microsoft.com/en-us/rest/api/storageservices/delete-table
    */
    requestOverride.headers = {};

    const tableToDelete = getUniqueName("table") + "del";

    tableService.createTable(tableToDelete, (error, result, response) => {
      if (!error) {
        tableService.deleteTable(tableToDelete, (deleteError, deleteResult) => {
          if (!deleteError) {
            // no body expected, we expect 204 no content on successful deletion
            assert.strictEqual(deleteResult.statusCode, 204);
          } else {
            assert.ifError(deleteError);
          }
          done();
        });
      } else {
        assert.fail("Test failed to create the table");
        done();
      }
    });
  });

  it("deleteTable that does not exist, @loki", (done) => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/delete-table
    requestOverride.headers = {};

    const tableToDelete = tableName + "causeerror";

    tableService.deleteTable(tableToDelete, (error, result) => {
      assert.strictEqual(result.statusCode, 404); // no body expected, we expect 404
      const storageError = error as any;
      assert.strictEqual(storageError.code, "ResourceNotFound");
      done();
    });
  });

  it("createTable with invalid version, @loki", (done) => {
    requestOverride.headers = { [HeaderConstants.X_MS_VERSION]: "invalid" };

    tableService.createTable("test", (error, result) => {
      assert.strictEqual(result.statusCode, 400);
      done();
    });
  });

  it("Should have a valid OData Metadata value when inserting a table, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    const newTableName: string = getUniqueName("table");
    tableService.createTable(newTableName, (error, result, response) => {
      if (
        !error &&
        result !== undefined &&
        response !== undefined &&
        response.body !== undefined
      ) {
        const body = response.body as object;
        const meta: string = body["odata.metadata" as keyof object];
        // service response for this operation ends with /@Element
        assert.strictEqual(meta.endsWith("/@Element"), true);
        done();
      } else {
        assert.ifError(error);
        done();
      }
    });
  });

  it("SetAccessPolicy should work @loki", (done) => {
    const tableAcl = {
      "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=": {
        Permissions: "raud",
        Expiry: new Date("2018-12-31T11:22:33.4567890Z"),
        Start: new Date("2017-12-31T11:22:33.4567890Z")
      },
      policy2: {
        Permissions: "a",
        Expiry: new Date("2030-11-31T11:22:33.4567890Z"),
        Start: new Date("2017-12-31T11:22:33.4567890Z")
      }
    };
    const aclTableName: string = tableName + "setAcl";
    tableService.createTable(aclTableName, (error, result, response) => {
      if (error) {
        const storageErr = error as StorageError;
        assert.strictEqual(storageErr.statusCode, 409, "TableDidNotExist");
      }

      // a random id used to test whether response returns the client id sent in request
      const setClientRequestId = "b86e2b01-a7b5-4df2-b190-205a0c24bd36";

      tableService.setTableAcl(
        aclTableName,
        tableAcl,
        { clientRequestId: setClientRequestId },
        (error2, result2, response2) => {
          if (error2) {
            assert.ifError(error2);
          }
          if (response2.headers) {
            assert.strictEqual(
              response2.headers["x-ms-client-request-id"],
              setClientRequestId
            );
          }

          // tslint:disable-next-line: no-shadowed-variable
          tableService.getTableAcl(
            aclTableName,
            { clientRequestId: setClientRequestId },
            (error3, result3, response3) => {
              if (error3) {
                assert.ifError(error3);
              }

              if (response3.headers) {
                assert.strictEqual(
                  response3.headers["x-ms-client-request-id"],
                  setClientRequestId
                );
              }

              assert.deepStrictEqual(result3.signedIdentifiers, tableAcl);
              done();
            }
          );
        }
      );
    });
  });

  it("setAccessPolicy negative @loki", (done) => {
    const tableAcl = {
      "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=": {
        Permissions: "rwdl",
        Expiry: new Date("2018-12-31T11:22:33.4567890Z"),
        Start: new Date("2017-12-31T11:22:33.4567890Z")
      },
      policy2: {
        Permissions: "a",
        Expiry: new Date("2030-11-31T11:22:33.4567890Z"),
        Start: new Date("2017-12-31T11:22:33.4567890Z")
      }
    };

    tableService.createTable(tableName + "setACLNeg", (error) => {
      if (error) {
        assert.ifError(error);
      }

      // tslint:disable-next-line: no-shadowed-variable
      tableService.setTableAcl(tableName + "setACLNeg", tableAcl, (error) => {
        assert.ok(error);
        done();
      });
    });
  });

  it("should respond to get table properties @loki", (done) => {
    tableName = getUniqueName("getProperties");
    tableService.createTable(tableName, (error) => {
      if (error) {
        assert.ifError(error);
      }
      tableService.getServiceProperties((getPropsError, getPropsResult) => {
        if (getPropsError) {
          assert.ifError(getPropsError);
        }
        assert.strictEqual(
          getPropsResult.Logging?.Version,
          "1.0",
          `value "${getPropsResult.Logging?.Version}" is not the expected MetaData for Logging Version`
        );
        done();
      });
    });
  });

  it("should delete a table using case-insensitive logic, @loki", (done) => {
    tableName = getUniqueName("caseInsensitive");
    tableService.createTable(tableName, (error) => {
      if (error) {
        assert.ifError(error);
      }
      tableService.deleteTable(tableName.toUpperCase(), (err, res) => {
        assert.ifError(err);
        done();
      });
    });
  });

  it("should preserve casing on table names, @loki", (done) => {
    tableName = getUniqueName("myTable");
    tableService.createTable(tableName, (createError) => {
      if (createError) {
        assert.ifError(createError);
      }
      tableService.listTablesSegmentedWithPrefix(
        "myTable",
        null as any,
        { maxResults: 10 },
        (error: any, result: any, response: any) => {
          assert.strictEqual(error, null);
          const validResult: boolean = result.entries.length > 0;
          assert.strictEqual(
            validResult,
            true,
            "We did not find the expected table!"
          );
          assert.notStrictEqual(response, null);
          done();
        }
      );
    });
  });

  // https://github.com/Azure/Azurite/issues/1726
  it("should not accidentally delete the wrong similarly named table, @loki", (done) => {
    const testTablePrefix = "deleteTest";
    const tableName = getUniqueName(testTablePrefix);
    tableService.createTable(tableName, (createError) => {
      if (createError) {
        assert.ifError(createError);
      }
      tableService.listTablesSegmentedWithPrefix(
        testTablePrefix,
        null as any,
        { maxResults: 250 },
        (error: any, result: any, response: any) => {
          assert.strictEqual(error, null);
          let validResult: boolean = false;
          // look for tableName in the result.entries[]
          for (const entry of result.entries) {
            if (entry === tableName) {
              validResult = true;
            }
          }

          assert.strictEqual(
            validResult,
            true,
            "We did not find the expected table!"
          );
          assert.notStrictEqual(response, null);

          // now create a second table with a similar name
          const tableName2 = getUniqueName(testTablePrefix);
          tableService.createTable(tableName2, (createError) => {
            if (createError) {
              assert.ifError(createError);
            }
            tableService.listTablesSegmentedWithPrefix(
              testTablePrefix,
              null as any,
              { maxResults: 250 },
              (error: any, result: any, response: any) => {
                assert.strictEqual(error, null);
                validResult = false;
                for (const entry of result.entries) {
                  if (entry === tableName2) {
                    validResult = true;
                  }
                }
                assert.strictEqual(
                  validResult,
                  true,
                  "We did not find the expected table!"
                );
                assert.notStrictEqual(response, null);
                // now delete the first table and check that the correct table was deleted
                tableService.deleteTable(tableName, (deleteError) => {
                  assert.ifError(deleteError);
                  tableService.listTablesSegmentedWithPrefix(
                    testTablePrefix,
                    null as any,
                    { maxResults: 250 },
                    (error: any, result: any, response: any) => {
                      assert.strictEqual(error, null);
                      validResult = false;
                      for (const entry of result.entries) {
                        if (entry === tableName) {
                          validResult = true;
                        }
                      }
                      assert.strictEqual(
                        validResult,
                        false,
                        "We found the table that should have been deleted!"
                      );
                      assert.notStrictEqual(response, null);
                      done();
                    }
                  );
                });
              }
            );
          });
        }
      );
    });
  });
});
