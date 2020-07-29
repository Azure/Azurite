import * as assert from "assert";
import * as Azure from "azure-storage";

import { configLogger } from "../../../src/common/Logger";
import TableConfiguration from "../../../src/table/TableConfiguration";
import TableServer from "../../../src/table/TableServer";
// import { TABLE_API_VERSION } from "../../../src/table/utils/constants";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  overrideRequest,
  sleep
} from "../../testutils";

// Set true to enable debug log
configLogger(false);

describe("table Entity APIs test", () => {
  // TODO: Create a server factory as tests utils
  const protocol = "http";
  const host = "127.0.0.1";
  const port = 11002;
  const metadataDbPath = "__tableTestsStorage__";

  const config = new TableConfiguration(
    host,
    port,
    metadataDbPath,
    false,
    false
  );

  let server: TableServer;
  const accountName = EMULATOR_ACCOUNT_NAME;
  const sharedKey = EMULATOR_ACCOUNT_KEY;
  const connectionString =
    `DefaultEndpointsProtocol=${protocol};AccountName=${accountName};` +
    `AccountKey=${sharedKey};TableEndpoint=${protocol}://${host}:${port}/${accountName};`;

  const tableService = Azure.createTableService(connectionString);

  let tableName: string = getUniqueName("table");

  const requestOverride = { headers: {} };
  overrideRequest(requestOverride, tableService);

  before(async () => {
    server = new TableServer(config);
    tableName = getUniqueName("table");
    await server.start();
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };

    tableService.createTable(tableName, (error, result, response) => {
      // created table for tests
    });
  });

  after(async () => {
    await server.close();
  });

  // Simple test in here until we have the full set checked in, as we need
  // a starting point for delete and query entity APIs
  it("Should insert new Entity, @loki", done => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/insert-entity
    const entity = {
      PartitionKey: "part1",
      RowKey: "row1",
      myValue: "value1"
    };
    tableService.insertEntity(tableName, entity, (error, result, response) => {
      assert.equal(response.statusCode, 201);
      done();
    });
  });

  it("Should delete an Entity given partition key and row key in the URL, @loki", done => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/delete-entity1
    const entity = {
      PartitionKey: "part1",
      RowKey: "row1",
      myValue: "somevalue"
    };

    /* https://docs.microsoft.com/en-us/rest/api/storageservices/delete-entity1#request-headers
    If-Match	Required. The client may specify the ETag for the entity on the request in
    order to compare to the ETag maintained by the service for the purpose of optimistic concurrency.
    The delete operation will be performed only if the ETag sent by the client matches the value
    maintained by the server, indicating that the entity has not been modified since it was retrieved by the client.
    To force an unconditional delete, set If-Match to the wildcard character (*). */
    requestOverride.headers = {
      Match: "*"
    };

    tableService.deleteEntity(tableName, entity, (error, response) => {
      assert.equal(response.statusCode, 204);
      done();
    });
  });

  it("Should not delete an Entity not matching Etag, @loki", done => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/delete-entity1
    const entity = {
      PartitionKey: "part1",
      RowKey: "row2",
      myValue: "shouldnotmatchetag"
    };
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    tableService.insertEntity(
      tableName,
      entity,
      (inserterror, insertresult, insertresponse) => {
        if (!inserterror) {
          sleep(10);
          requestOverride.headers = {
            Match: "0x2252C97588D4000" // just a random etag
          };
          // this delete should fail as we modified the etag, but we get ECONRESET???
          tableService.deleteEntity(
            tableName,
            entity,
            (deleteerror, deleteresponse) => {
              if (!deleteerror) {
                assert.equal(deleteresponse.statusCode, 412); // Precondition failed
                done();
              } else {
                assert.ifError(deleteerror);
                done();
              }
            }
          );
        } else {
          assert.ifError(inserterror);
          done();
        }
      }
    );
  });

  it("Should not delete an matching Etag, @loki", done => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/delete-entity1
    const entity = {
      PartitionKey: "part1",
      RowKey: "row3",
      myValue: "shouldmatchetag"
    };
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    tableService.insertEntity(
      tableName,
      entity,
      (error, result, insertresponse) => {
        if (!error) {
          const etag: string = result[".metadata"].etag;
          requestOverride.headers = {
            Match: etag
          };
          // this delete should fail as we modify the etag
          tableService.deleteEntity(
            tableName,
            entity,
            (deleteerror, deleteresponse) => {
              if (!deleteerror) {
                assert.equal(deleteresponse.statusCode, 204); // Precondition succeeded
                done();
              } else {
                assert.ifError(deleteerror);
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
});
