import * as assert from "assert";
import TableServer from "../../../src/table/TableServer";
import { getUniqueName } from "../../testutils";
import { postToAzurite } from "../utils/table.entity.tests.rest.submitter";
import TableTestServerFactory from "../utils/TableTestServerFactory";

describe("table entity Edm.Int64 REST tests", () => {
  let server: TableServer;

  before(async () => {
    server = new TableTestServerFactory().createServer({
      metadataDBPath: "__tableInt64TestsStorage__",
      enableDebugLog: true,
      debugLogFilePath: "",
      loose: false,
      skipApiVersionCheck: true,
      https: false
    });
    await server.start();
  });

  after(async () => {
    await server.close();
  });

  it("Should enforce the signed Edm.Int64 range, @loki", async () => {
    const tableName = getUniqueName("int64");
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json;odata=nometadata"
    };
    const createTableResult = await postToAzurite(
      "Tables",
      JSON.stringify({ TableName: tableName }),
      headers
    );
    assert.strictEqual(createTableResult.status, 201);

    for (const [rowKey, value] of [
      ["minimum", "-9223372036854775808"],
      ["maximum", "9223372036854775807"]
    ]) {
      const result = await postToAzurite(
        tableName,
        JSON.stringify({
          PartitionKey: "int64",
          RowKey: rowKey,
          Value: value,
          "Value@odata.type": "Edm.Int64"
        }),
        headers
      );
      assert.strictEqual(result.status, 201);
    }

    await assert.rejects(
      postToAzurite(
        tableName,
        JSON.stringify({
          PartitionKey: "int64",
          RowKey: "ulong-max-value",
          Value: "18446744073709551615",
          "Value@odata.type": "Edm.Int64"
        }),
        headers
      ),
      (error: any) => {
        assert.strictEqual(error.response?.status, 400);
        assert.strictEqual(
          error.response?.data?.["odata.error"]?.code,
          "InvalidInput"
        );
        return true;
      }
    );
  });
});
