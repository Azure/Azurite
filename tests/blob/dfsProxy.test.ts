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
import axios from "axios";
import * as assert from "assert";

import DfsConfiguration from "../../src/blob/DfsConfiguration";
import DfsServer from "../../src/blob/DfsServer";
import BlobServer from "../../src/blob/BlobServer";
import { BLOB_API_VERSION } from "../../src/blob/utils/constants";
import { configLogger } from "../../src/common/Logger";
import BlobTestServerFactory from "../BlobTestServerFactory";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../testutils";

configLogger(false);

describe("DfsProxy", () => {
  const factory = new BlobTestServerFactory();
  const blobServer = factory.createServer();

  const dfsConfig = new DfsConfiguration(
    "127.0.0.1",
    11004
  );
  const dfsServer = new DfsServer(
    dfsConfig,
    (blobServer as BlobServer).metadataStore,
    (blobServer as BlobServer).extentStore,
    (blobServer as BlobServer).accountDataStore
  );

  const blobServiceClient = new BlobServiceClient(
    `http://${blobServer.config.host}:${blobServer.config.port}/${EMULATOR_ACCOUNT_NAME}`,
    newPipeline(new StorageSharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY), {
      retryOptions: { maxTries: 1 },
      keepAliveOptions: { enable: false }
    })
  );

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

  const dfsBaseUrl = `http://${dfsConfig.host}:${dfsConfig.port}/${EMULATOR_ACCOUNT_NAME}`;

  before(async () => {
    await blobServer.start();
    await dfsServer.start();
  });

  after(async () => {
    await dfsServer.close();
    await blobServer.close();
    await blobServer.clean();
  });

  it("maps filesystem create and delete to container operations @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const createUrl = `${dfsBaseUrl}/${fileSystemName}?resource=filesystem&${sas}`;

    const createResponse = await axios.put(createUrl, undefined, {
      headers: {
        "x-ms-version": BLOB_API_VERSION
      },
      validateStatus: () => true
    });

    assert.strictEqual(createResponse.status, 201);

    const created = await blobServiceClient
      .getContainerClient(fileSystemName)
      .getProperties();
    assert.ok(created.etag);

    const deleteResponse = await axios.delete(createUrl, {
      headers: {
        "x-ms-version": BLOB_API_VERSION
      },
      validateStatus: () => true
    });

    assert.strictEqual(deleteResponse.status, 202);

    try {
      await blobServiceClient.getContainerClient(fileSystemName).getProperties();
      assert.fail("Expected container to be deleted");
    } catch (error) {
      assert.strictEqual((error as any).statusCode, 404);
    }
  });

  it("maps filesystem HEAD to container properties and returns filesystem header @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    const headUrl = `${dfsBaseUrl}/${fileSystemName}?resource=filesystem&${sas}`;

    const response = await axios.head(headUrl, {
      headers: {
        "x-ms-version": BLOB_API_VERSION
      },
      validateStatus: () => true
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers["x-ms-resource-type"], "filesystem");

    await containerClient.delete();
  });

  it("creates and reads a file via DFS path operations @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    // Create a file
    const fileName = "test-file.txt";
    const createUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?resource=file&${sas}`;

    const createResponse = await axios.put(createUrl, undefined, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
    assert.strictEqual(createResponse.status, 201);

    // Verify file exists via blob API
    const blobClient = containerClient.getBlobClient(fileName);
    const props = await blobClient.getProperties();
    assert.ok(props.etag);
    assert.strictEqual(props.contentLength, 0);

    // Get path properties via DFS
    const headUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?${sas}`;
    const headResponse = await axios.head(headUrl, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
    assert.strictEqual(headResponse.status, 200);
    assert.strictEqual(headResponse.headers["x-ms-resource-type"], "file");

    // Delete via DFS
    const deleteUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?${sas}`;
    const deleteResponse = await axios.delete(deleteUrl, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
    assert.strictEqual(deleteResponse.status, 200);

    await containerClient.delete();
  });

  it("creates a directory with hdi_isfolder metadata @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    const dirName = "test-dir";
    const createUrl = `${dfsBaseUrl}/${fileSystemName}/${dirName}?resource=directory&${sas}`;

    const createResponse = await axios.put(createUrl, undefined, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
    assert.strictEqual(createResponse.status, 201);

    // Verify it's a directory via DFS HEAD
    const headUrl = `${dfsBaseUrl}/${fileSystemName}/${dirName}?${sas}`;
    const headResponse = await axios.head(headUrl, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
    assert.strictEqual(headResponse.status, 200);
    assert.strictEqual(headResponse.headers["x-ms-resource-type"], "directory");

    // Delete directory
    const deleteUrl = `${dfsBaseUrl}/${fileSystemName}/${dirName}?recursive=true&${sas}`;
    const deleteResponse = await axios.delete(deleteUrl, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
    assert.strictEqual(deleteResponse.status, 200);

    await containerClient.delete();
  });

  it("lists paths in a filesystem @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    // Create some files via DFS
    for (const name of ["file1.txt", "file2.txt", "dir1"]) {
      const resource = name === "dir1" ? "directory" : "file";
      const url = `${dfsBaseUrl}/${fileSystemName}/${name}?resource=${resource}&${sas}`;
      await axios.put(url, undefined, {
        headers: { "x-ms-version": BLOB_API_VERSION },
        validateStatus: () => true
      });
    }

    // List paths
    const listUrl = `${dfsBaseUrl}/${fileSystemName}?resource=filesystem&recursive=true&${sas}`;
    const listResponse = await axios.get(listUrl, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });

    assert.strictEqual(listResponse.status, 200);
    assert.ok(listResponse.data.paths);
    assert.ok(listResponse.data.paths.length >= 3);

    const pathNames = listResponse.data.paths.map((p: any) => p.name);
    assert.ok(pathNames.includes("file1.txt"));
    assert.ok(pathNames.includes("file2.txt"));
    assert.ok(pathNames.includes("dir1"));

    // Verify dir1 is marked as directory
    const dir1 = listResponse.data.paths.find((p: any) => p.name === "dir1");
    assert.strictEqual(dir1.isDirectory, true);

    await containerClient.delete();
  });

  it("appends data and flushes to create file content @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    const fileName = "append-test.txt";

    // Create empty file
    const createUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?resource=file&${sas}`;
    await axios.put(createUrl, undefined, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });

    // Append data
    const data1 = "Hello, ";
    const data2 = "World!";

    const append1Url = `${dfsBaseUrl}/${fileSystemName}/${fileName}?action=append&position=0&${sas}`;
    const append1Response = await fetch(append1Url, {
      method: "PATCH",
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "Content-Type": "application/octet-stream"
      },
      body: data1
    });
    assert.strictEqual(append1Response.status, 202);

    const append2Url = `${dfsBaseUrl}/${fileSystemName}/${fileName}?action=append&position=${Buffer.byteLength(data1)}&${sas}`;
    const append2Response = await fetch(append2Url, {
      method: "PATCH",
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "Content-Type": "application/octet-stream"
      },
      body: data2
    });
    assert.strictEqual(append2Response.status, 202);

    // Flush
    const totalLength = Buffer.byteLength(data1) + Buffer.byteLength(data2);
    const flushUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?action=flush&position=${totalLength}&${sas}`;
    const flushResponse = await fetch(flushUrl, {
      method: "PATCH",
      headers: { "x-ms-version": BLOB_API_VERSION }
    });
    assert.strictEqual(flushResponse.status, 200);

    // Read back via DFS
    const readUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?${sas}`;
    const readResponse = await fetch(readUrl, {
      headers: { "x-ms-version": BLOB_API_VERSION }
    });
    assert.strictEqual(readResponse.status, 200);
    const readBody = await readResponse.text();
    assert.strictEqual(readBody, "Hello, World!");

    await containerClient.delete();
  });

  it("renames a file via DFS @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    // Create a file
    const oldName = "old-file.txt";
    const createUrl = `${dfsBaseUrl}/${fileSystemName}/${oldName}?resource=file&${sas}`;
    await axios.put(createUrl, undefined, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });

    // Rename it
    const newName = "new-file.txt";
    const renameUrl = `${dfsBaseUrl}/${fileSystemName}/${newName}?${sas}`;
    const renameResponse = await axios.put(renameUrl, undefined, {
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "x-ms-rename-source": `/${EMULATOR_ACCOUNT_NAME}/${fileSystemName}/${oldName}`
      },
      validateStatus: () => true
    });
    assert.strictEqual(renameResponse.status, 201);

    // Old path should not exist
    const oldHeadUrl = `${dfsBaseUrl}/${fileSystemName}/${oldName}?${sas}`;
    const oldHeadResponse = await axios.head(oldHeadUrl, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
    assert.strictEqual(oldHeadResponse.status, 404);

    // New path should exist
    const newHeadUrl = `${dfsBaseUrl}/${fileSystemName}/${newName}?${sas}`;
    const newHeadResponse = await axios.head(newHeadUrl, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
    assert.strictEqual(newHeadResponse.status, 200);

    await containerClient.delete();
  });

  it("sets and gets ACLs on a path @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    // Create a file
    const fileName = "acl-test.txt";
    const createUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?resource=file&${sas}`;
    await axios.put(createUrl, undefined, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });

    // Set ACL
    const setAclUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?action=setAccessControl&${sas}`;
    const setAclResponse = await fetch(setAclUrl, {
      method: "PATCH",
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "x-ms-owner": "testowner",
        "x-ms-group": "testgroup",
        "x-ms-permissions": "rwxr-x---",
        "x-ms-acl": "user::rwx,group::r-x,other::---"
      }
    });
    assert.strictEqual(setAclResponse.status, 200);

    // Get ACL
    const getAclUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?action=getAccessControl&${sas}`;
    const getAclResponse = await axios.head(getAclUrl, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
    assert.strictEqual(getAclResponse.status, 200);
    assert.strictEqual(getAclResponse.headers["x-ms-owner"], "testowner");
    assert.strictEqual(getAclResponse.headers["x-ms-group"], "testgroup");
    assert.strictEqual(getAclResponse.headers["x-ms-permissions"], "rwxr-x---");
    assert.strictEqual(getAclResponse.headers["x-ms-acl"], "user::rwx,group::r-x,other::---");

    await containerClient.delete();
  });

  it("sets filesystem properties via PATCH @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const createUrl = `${dfsBaseUrl}/${fileSystemName}?resource=filesystem&${sas}`;
    await axios.put(createUrl, undefined, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });

    // Set properties
    const propValue = Buffer.from("bar").toString("base64");
    const patchUrl = `${dfsBaseUrl}/${fileSystemName}?resource=filesystem&${sas}`;
    const patchResponse = await fetch(patchUrl, {
      method: "PATCH",
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "x-ms-properties": `foo=${propValue}`
      }
    });
    assert.strictEqual(patchResponse.status, 200);

    // Delete
    await axios.delete(createUrl, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
  });

  it("validates Content-MD5 on append @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    const fileName = "md5-test.txt";
    const createUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?resource=file&${sas}`;
    await axios.put(createUrl, undefined, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });

    // Append with correct MD5
    const data = "test data";
    const crypto = require("crypto");
    const correctMD5 = crypto.createHash("md5").update(data).digest("base64");

    const appendUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?action=append&position=0&${sas}`;
    const goodResponse = await fetch(appendUrl, {
      method: "PATCH",
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "Content-Type": "application/octet-stream",
        "Content-MD5": correctMD5
      },
      body: data
    });
    assert.strictEqual(goodResponse.status, 202);

    // Append with wrong MD5
    const appendUrl2 = `${dfsBaseUrl}/${fileSystemName}/${fileName}?action=append&position=${Buffer.byteLength(data)}&${sas}`;
    const badResponse = await fetch(appendUrl2, {
      method: "PATCH",
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "Content-Type": "application/octet-stream",
        "Content-MD5": "AAAAAAAAAAAAAAAAAAAAAA=="
      },
      body: "more data"
    });
    assert.strictEqual(badResponse.status, 400);
    const errorBody = await badResponse.json() as any;
    assert.strictEqual(errorBody.error.code, "Md5Mismatch");

    await containerClient.delete();
  });
});
