/**
 * DFS (ADLS Gen2) endpoint behaviors that depend on the server configuration.
 */

import {
  AccountSASPermissions,
  AccountSASResourceTypes,
  AccountSASServices,
  BlobServiceClient,
  generateAccountSASQueryParameters,
  newPipeline,
  SASProtocol,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import * as assert from "assert";
import axios from "axios";

import { configLogger } from "../../src/common/Logger";
import BlobTestServerFactory from "../BlobTestServerFactory";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../testutils";

configLogger(false);

const sas = generateAccountSASQueryParameters(
  {
    expiresOn: new Date(Date.now() + 60 * 60 * 1000),
    startsOn: new Date(Date.now() - 10 * 60 * 1000),
    permissions: AccountSASPermissions.parse("rwdlacupitfx"),
    resourceTypes: AccountSASResourceTypes.parse("sco").toString(),
    services: AccountSASServices.parse("b").toString(),
    protocol: SASProtocol.HttpsAndHttp
  },
  new StorageSharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY)
).toString();

describe("DFS endpoint with the hierarchical namespace disabled", () => {
  const factory = new BlobTestServerFactory();
  const server = factory.createServer(false, true, false, undefined, false);
  const baseUrl = `http://${server.config.host}:${server.config.port}/${EMULATOR_ACCOUNT_NAME}`;

  before(async () => { await server.start(); });
  after(async () => { await server.close(); await server.clean(); });

  it("rejects DFS operations and ignores x-ms-namespace-enabled @loki @sql", async () => {
    const fs = getUniqueName("fs");
    const dfsCreate = await axios.put(`${baseUrl}/${fs}?resource=filesystem&${sas}`, undefined, {
      headers: { "x-ms-namespace-enabled": "true" }, validateStatus: () => true
    });
    assert.strictEqual(dfsCreate.status, 400);
    assert.strictEqual(dfsCreate.data.error.code, "HierarchicalNamespaceNotEnabled");
    assert.ok(dfsCreate.data.error.message.includes("with --enableHierarchicalNamespace"));

    const blobCreate = await axios.put(`${baseUrl}/${fs}?restype=container&${sas}`, undefined, {
      headers: { "x-ms-namespace-enabled": "true" }, validateStatus: () => true
    });
    assert.strictEqual(blobCreate.status, 201);
    const containerClient = new BlobServiceClient(baseUrl, newPipeline(
      new StorageSharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY)
    )).getContainerClient(fs);
    assert.strictEqual((await containerClient.getAccountInfo()).isHierarchicalNamespaceEnabled, false);

    const listPaths = await axios.get(`${baseUrl}/${fs}?resource=filesystem&recursive=true&${sas}`, { validateStatus: () => true });
    assert.strictEqual(listPaths.status, 400);

    await containerClient.delete();
  });
});

describe("DFS endpoint API version check", () => {
  const factory = new BlobTestServerFactory();
  const server = factory.createServer(false, false, false, undefined, true);
  const baseUrl = `http://${server.config.host}:${server.config.port}/${EMULATOR_ACCOUNT_NAME}`;

  before(async () => { await server.start(); });
  after(async () => { await server.close(); await server.clean(); });

  it("returns the error code of an unsupported x-ms-version @loki @sql", async () => {
    const res = await axios.put(`${baseUrl}/${getUniqueName("fs")}?resource=filesystem&${sas}`, undefined, {
      headers: { "x-ms-version": "1999-01-01" }, validateStatus: () => true
    });
    assert.strictEqual(res.status, 400);
    assert.notStrictEqual(res.data.error.code, "InvalidInput");
    assert.strictEqual(res.headers["x-ms-error-code"], res.data.error.code);
  });
});
