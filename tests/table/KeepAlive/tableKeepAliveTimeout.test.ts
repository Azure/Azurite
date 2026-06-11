import { strict as assert } from "assert";
import { TableServiceClient } from "@azure/data-tables";
import {
  createDefaultHttpClient,
  HttpClient,
  PipelineRequest,
  PipelineResponse
} from "@azure/core-rest-pipeline";

import * as http from "http";

import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import {
  createConnectionStringForTest,
  createTableServerForTest
} from "../utils/table.entity.test.utils";
import { DEFAULT_TABLE_KEEP_ALIVE_TIMEOUT } from "../../../src/table/utils/constants";

// Set true to enable debug log
configLogger(false);

// For convenience, we have a switch to control the use
// of a local Azurite instance, otherwise we need an
// ENV VAR called AZURE_TABLE_STORAGE added to mocha
// script or launch.json containing
// Azure Storage Connection String (using SAS or Key).
const testLocalAzuriteInstance = true;

describe("Table Keep-Alive header response test", () => {
  let server: TableServer;
  let client: TableServiceClient;
  let keepAliveHeader: string | undefined;

  before(async () => {
    server = createTableServerForTest();
    await server.start();

    const connectionString = createConnectionStringForTest(
      testLocalAzuriteInstance
    );

    const keepAliveAgent = new http.Agent({ keepAlive: true });
    const defaultHttpClient = createDefaultHttpClient();

    // ✅ Proper typed custom HTTP client
    const customHttpClient: HttpClient = {
      async sendRequest(request: PipelineRequest): Promise<PipelineResponse> {
        request.agent = keepAliveAgent;

        const response = await defaultHttpClient.sendRequest(request);

        // ✅ Capture header from raw response
        keepAliveHeader = response.headers.get("keep-alive") ?? undefined;

        return response;
      }
    };

    client = TableServiceClient.fromConnectionString(connectionString, {
      allowInsecureConnection: testLocalAzuriteInstance,
      httpClient: customHttpClient // ✅ correct injection
    });
  });

  after(async () => {
    await server.close();
  });

  it("request with enabled keep-alive shall return DEFAULT_TABLE_KEEP_ALIVE_TIMEOUT", async () => {
    await client.getProperties();

    assert.ok(keepAliveHeader !== undefined, "Missing keep-alive header");

    assert.strictEqual(
      keepAliveHeader,
      `timeout=${DEFAULT_TABLE_KEEP_ALIVE_TIMEOUT}`
    );
  });
});
