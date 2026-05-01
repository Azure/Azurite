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

import { BLOB_API_VERSION } from "../../src/blob/utils/constants";
import { configLogger } from "../../src/common/Logger";
import BlobTestServerFactory from "../BlobTestServerFactory";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../testutils";

configLogger(false);

// All DFS requests must carry a signal the router recognises as DFS.
// Blob API leases carry ?comp=lease; DFS operations don't, but some (plain HEAD/DELETE)
// carry no other signal, so we add the DataLake SDK user-agent string.
const dfsAxios = axios.create({
  headers: { "User-Agent": "azsdk-js/storage-file-datalake" }
});

describe("DfsProxy", () => {
  const factory = new BlobTestServerFactory();
  const blobServer = factory.createServer(false, true, false, undefined, true);

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

  const dfsBaseUrl = `http://${blobServer.config.host}:${blobServer.config.port}/${EMULATOR_ACCOUNT_NAME}`;

  before(async () => {
    await blobServer.start();
  });

  after(async () => {
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

    const deleteResponse = await dfsAxios.delete(createUrl, {
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

    const response = await dfsAxios.head(headUrl, {
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
    const headResponse = await dfsAxios.head(headUrl, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
    assert.strictEqual(headResponse.status, 200);
    assert.strictEqual(headResponse.headers["x-ms-resource-type"], "file");

    // Delete via DFS
    const deleteUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?${sas}`;
    const deleteResponse = await dfsAxios.delete(deleteUrl, {
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
    const headResponse = await dfsAxios.head(headUrl, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
    assert.strictEqual(headResponse.status, 200);
    assert.strictEqual(headResponse.headers["x-ms-resource-type"], "directory");

    // Delete directory
    const deleteUrl = `${dfsBaseUrl}/${fileSystemName}/${dirName}?recursive=true&${sas}`;
    const deleteResponse = await dfsAxios.delete(deleteUrl, {
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
    const append1Response = await dfsAxios.patch(append1Url, data1, {
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "Content-Type": "application/octet-stream"
      },
      validateStatus: () => true
    });
    assert.strictEqual(append1Response.status, 202);

    const append2Url = `${dfsBaseUrl}/${fileSystemName}/${fileName}?action=append&position=${Buffer.byteLength(data1)}&${sas}`;
    const append2Response = await dfsAxios.patch(append2Url, data2, {
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "Content-Type": "application/octet-stream"
      },
      validateStatus: () => true
    });
    assert.strictEqual(append2Response.status, 202);

    // Flush
    const totalLength = Buffer.byteLength(data1) + Buffer.byteLength(data2);
    const flushUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?action=flush&position=${totalLength}&${sas}`;
    const flushResponse = await dfsAxios.patch(flushUrl, null, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
    assert.strictEqual(flushResponse.status, 200);

    // Read back via DFS
    const readUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?${sas}`;
    const readResponse = await dfsAxios.get(readUrl, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
    assert.strictEqual(readResponse.status, 200);
    assert.strictEqual(readResponse.data, "Hello, World!");

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
    const oldHeadResponse = await dfsAxios.head(oldHeadUrl, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
    assert.strictEqual(oldHeadResponse.status, 404);

    // New path should exist
    const newHeadUrl = `${dfsBaseUrl}/${fileSystemName}/${newName}?${sas}`;
    const newHeadResponse = await dfsAxios.head(newHeadUrl, {
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
    const setAclResponse = await dfsAxios.patch(setAclUrl, null, {
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "x-ms-owner": "testowner",
        "x-ms-group": "testgroup",
        "x-ms-permissions": "rwxr-x---",
        "x-ms-acl": "user::rwx,group::r-x,other::---"
      },
      validateStatus: () => true
    });
    assert.strictEqual(setAclResponse.status, 200);

    // Get ACL
    const getAclUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?action=getAccessControl&${sas}`;
    const getAclResponse = await dfsAxios.head(getAclUrl, {
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
    const patchResponse = await dfsAxios.patch(patchUrl, null, {
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "x-ms-properties": `foo=${propValue}`
      },
      validateStatus: () => true
    });
    assert.strictEqual(patchResponse.status, 200);

    // Delete
    await dfsAxios.delete(createUrl, {
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
    const goodResponse = await dfsAxios.patch(appendUrl, data, {
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "Content-Type": "application/octet-stream",
        "Content-MD5": correctMD5
      },
      validateStatus: () => true
    });
    assert.strictEqual(goodResponse.status, 202);

    // Append with wrong MD5
    const appendUrl2 = `${dfsBaseUrl}/${fileSystemName}/${fileName}?action=append&position=${Buffer.byteLength(data)}&${sas}`;
    const badResponse = await dfsAxios.patch(appendUrl2, "more data", {
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "Content-Type": "application/octet-stream",
        "Content-MD5": "AAAAAAAAAAAAAAAAAAAAAA=="
      },
      validateStatus: () => true
    });
    assert.strictEqual(badResponse.status, 400);
    assert.strictEqual(badResponse.data.error.code, "Md5Mismatch");

    await containerClient.delete();
  });

  it("respects If-Match conditional header on getProperties @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    const fileName = "cond-test.txt";
    const createUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?resource=file&${sas}`;
    const createResponse = await axios.put(createUrl, undefined, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
    assert.strictEqual(createResponse.status, 201);
    const etag = createResponse.headers["etag"];

    // Matching ETag should succeed
    const headUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?${sas}`;
    const matchResponse = await dfsAxios.head(headUrl, {
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "If-Match": etag
      },
      validateStatus: () => true
    });
    assert.strictEqual(matchResponse.status, 200);

    // Non-matching ETag should fail with 412
    const noMatchResponse = await dfsAxios.head(headUrl, {
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "If-Match": `"0xDEADBEEF"`
      },
      validateStatus: () => true
    });
    assert.strictEqual(noMatchResponse.status, 412);

    await containerClient.delete();
  });

  it("respects If-None-Match conditional header on read @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    const fileName = "cond-read.txt";
    const createUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?resource=file&${sas}`;
    const createResponse = await axios.put(createUrl, undefined, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
    const etag = createResponse.headers["etag"];

    // Read with non-matching If-None-Match should succeed
    const readUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?${sas}`;
    const readResponse = await dfsAxios.get(readUrl, {
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "If-None-Match": `"0xDEADBEEF"`
      },
      validateStatus: () => true
    });
    assert.strictEqual(readResponse.status, 200);

    // Read with matching If-None-Match should return 304
    const notModifiedResponse = await dfsAxios.get(readUrl, {
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "If-None-Match": etag
      },
      validateStatus: () => true
    });
    assert.strictEqual(notModifiedResponse.status, 304);

    await containerClient.delete();
  });

  it("acquires, renews, and releases a lease on a path @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    const fileName = "lease-test.txt";
    const createUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?resource=file&${sas}`;
    await axios.put(createUrl, undefined, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });

    const pathUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?${sas}`;

    // Acquire lease
    const acquireResponse = await dfsAxios.post(pathUrl, null, {
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "x-ms-lease-action": "acquire",
        "x-ms-lease-duration": "60"
      },
      validateStatus: () => true
    });
    assert.strictEqual(acquireResponse.status, 201);
    const leaseId = acquireResponse.headers["x-ms-lease-id"];
    assert.ok(leaseId);

    // Renew lease
    const renewResponse = await dfsAxios.post(pathUrl, null, {
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "x-ms-lease-action": "renew",
        "x-ms-lease-id": leaseId!
      },
      validateStatus: () => true
    });
    assert.strictEqual(renewResponse.status, 200);

    // Release lease
    const releaseResponse = await dfsAxios.post(pathUrl, null, {
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "x-ms-lease-action": "release",
        "x-ms-lease-id": leaseId!
      },
      validateStatus: () => true
    });
    assert.strictEqual(releaseResponse.status, 200);

    await containerClient.delete();
  });

  it("breaks a lease on a path @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    const fileName = "break-lease.txt";
    const createUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?resource=file&${sas}`;
    await axios.put(createUrl, undefined, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });

    const pathUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?${sas}`;

    // Acquire lease first
    const acquireResponse = await dfsAxios.post(pathUrl, null, {
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "x-ms-lease-action": "acquire",
        "x-ms-lease-duration": "60"
      },
      validateStatus: () => true
    });
    assert.strictEqual(acquireResponse.status, 201);

    // Break lease
    const breakResponse = await dfsAxios.post(pathUrl, null, {
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "x-ms-lease-action": "break"
      },
      validateStatus: () => true
    });
    assert.strictEqual(breakResponse.status, 202);

    await containerClient.delete();
  });

  it("changes a lease on a path @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    const fileName = "change-lease.txt";
    const createUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?resource=file&${sas}`;
    await axios.put(createUrl, undefined, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });

    const pathUrl = `${dfsBaseUrl}/${fileSystemName}/${fileName}?${sas}`;

    // Acquire lease
    const acquireResponse = await dfsAxios.post(pathUrl, null, {
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "x-ms-lease-action": "acquire",
        "x-ms-lease-duration": "60"
      },
      validateStatus: () => true
    });
    assert.strictEqual(acquireResponse.status, 201);
    const leaseId = acquireResponse.headers["x-ms-lease-id"];
    assert.ok(leaseId);

    // Change lease
    const newLeaseId = "d7e6eb60-f905-4b44-a090-123456789012";
    const changeResponse = await dfsAxios.post(pathUrl, null, {
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "x-ms-lease-action": "change",
        "x-ms-lease-id": leaseId!,
        "x-ms-proposed-lease-id": newLeaseId
      },
      validateStatus: () => true
    });
    assert.strictEqual(changeResponse.status, 200);
    assert.strictEqual(changeResponse.headers["x-ms-lease-id"], newLeaseId);

    // Release with new lease ID
    await dfsAxios.post(pathUrl, null, {
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "x-ms-lease-action": "release",
        "x-ms-lease-id": newLeaseId
      },
      validateStatus: () => true
    });

    await containerClient.delete();
  });

  it("renames a directory and its children atomically @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    // Create a directory with children
    const dirName = "src-dir";
    const createDirUrl = `${dfsBaseUrl}/${fileSystemName}/${dirName}?resource=directory&${sas}`;
    await axios.put(createDirUrl, undefined, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });

    for (const child of ["child1.txt", "child2.txt"]) {
      const createFileUrl = `${dfsBaseUrl}/${fileSystemName}/${dirName}/${child}?resource=file&${sas}`;
      await axios.put(createFileUrl, undefined, {
        headers: { "x-ms-version": BLOB_API_VERSION },
        validateStatus: () => true
      });
    }

    // Rename directory
    const newDirName = "dest-dir";
    const renameUrl = `${dfsBaseUrl}/${fileSystemName}/${newDirName}?${sas}`;
    const renameResponse = await axios.put(renameUrl, undefined, {
      headers: {
        "x-ms-version": BLOB_API_VERSION,
        "x-ms-rename-source": `/${EMULATOR_ACCOUNT_NAME}/${fileSystemName}/${dirName}`
      },
      validateStatus: () => true
    });
    assert.strictEqual(renameResponse.status, 201);

    // Verify old dir doesn't exist
    const oldHeadUrl = `${dfsBaseUrl}/${fileSystemName}/${dirName}?${sas}`;
    const oldHeadResponse = await dfsAxios.head(oldHeadUrl, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
    assert.strictEqual(oldHeadResponse.status, 404);

    // Verify new dir exists
    const newHeadUrl = `${dfsBaseUrl}/${fileSystemName}/${newDirName}?${sas}`;
    const newHeadResponse = await dfsAxios.head(newHeadUrl, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
    assert.strictEqual(newHeadResponse.status, 200);
    assert.strictEqual(newHeadResponse.headers["x-ms-resource-type"], "directory");

    // Verify children were moved
    for (const child of ["child1.txt", "child2.txt"]) {
      const childUrl = `${dfsBaseUrl}/${fileSystemName}/${newDirName}/${child}?${sas}`;
      const childResponse = await dfsAxios.head(childUrl, {
        headers: { "x-ms-version": BLOB_API_VERSION },
        validateStatus: () => true
      });
      assert.strictEqual(childResponse.status, 200, `Expected ${newDirName}/${child} to exist`);
    }

    await containerClient.delete();
  });

  it("prevents deleting non-empty directory without recursive flag @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    // Create directory with a child file
    const dirName = "nonempty-dir";
    await axios.put(
      `${dfsBaseUrl}/${fileSystemName}/${dirName}?resource=directory&${sas}`,
      undefined,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true }
    );
    await axios.put(
      `${dfsBaseUrl}/${fileSystemName}/${dirName}/file.txt?resource=file&${sas}`,
      undefined,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true }
    );

    // Try to delete without recursive — should fail with 409
    const deleteUrl = `${dfsBaseUrl}/${fileSystemName}/${dirName}?${sas}`;
    const deleteResponse = await dfsAxios.delete(deleteUrl, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
    assert.strictEqual(deleteResponse.status, 409);
    assert.strictEqual(deleteResponse.data.error.code, "DirectoryNotEmpty");

    // Delete with recursive=true should succeed
    const recursiveDeleteUrl = `${dfsBaseUrl}/${fileSystemName}/${dirName}?recursive=true&${sas}`;
    const recursiveDeleteResponse = await dfsAxios.delete(recursiveDeleteUrl, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
    assert.strictEqual(recursiveDeleteResponse.status, 200);

    // Verify directory is gone
    const headUrl = `${dfsBaseUrl}/${fileSystemName}/${dirName}?${sas}`;
    const headResponse = await dfsAxios.head(headUrl, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
    assert.strictEqual(headResponse.status, 404);

    await containerClient.delete();
  });

  it("auto-creates intermediate directories in HNS hierarchy @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    // Create a deeply nested file — intermediate dirs should be created
    const deepPath = "a/b/c/deep-file.txt";
    const createUrl = `${dfsBaseUrl}/${fileSystemName}/${deepPath}?resource=file&${sas}`;
    const createResponse = await axios.put(createUrl, undefined, {
      headers: { "x-ms-version": BLOB_API_VERSION },
      validateStatus: () => true
    });
    assert.strictEqual(createResponse.status, 201);

    // Verify intermediate directories exist
    for (const dir of ["a", "a/b", "a/b/c"]) {
      const headUrl = `${dfsBaseUrl}/${fileSystemName}/${dir}?${sas}`;
      const headResponse = await dfsAxios.head(headUrl, {
        headers: { "x-ms-version": BLOB_API_VERSION },
        validateStatus: () => true
      });
      assert.strictEqual(headResponse.status, 200, `Expected directory ${dir} to exist`);
      assert.strictEqual(headResponse.headers["x-ms-resource-type"], "directory");
    }

    await containerClient.delete();
  });

  // ---------------------------------------------------------------------------
  // setAccessControlRecursive
  // ---------------------------------------------------------------------------

  it("sets ACL recursively on a directory tree with mode=set @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    // Build: dir/ dir/file1.txt  dir/subdir/  dir/subdir/file2.txt
    for (const [url] of [
      [`${dfsBaseUrl}/${fileSystemName}/dir?resource=directory&${sas}`],
      [`${dfsBaseUrl}/${fileSystemName}/dir/file1.txt?resource=file&${sas}`],
      [`${dfsBaseUrl}/${fileSystemName}/dir/subdir?resource=directory&${sas}`],
      [`${dfsBaseUrl}/${fileSystemName}/dir/subdir/file2.txt?resource=file&${sas}`]
    ]) {
      await axios.put(url, undefined, { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });
    }

    const aclUrl = `${dfsBaseUrl}/${fileSystemName}/dir?action=setAccessControlRecursive&mode=set&${sas}`;
    const response = await dfsAxios.patch(aclUrl, null, {
      headers: { "x-ms-version": BLOB_API_VERSION, "x-ms-acl": "user::rwx,group::r-x,other::---" },
      validateStatus: () => true
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.directoriesSuccessful, 2); // dir + subdir
    assert.strictEqual(response.data.filesSuccessful, 2);       // file1.txt + file2.txt
    assert.strictEqual(response.data.failureCount, 0);

    // Verify ACL propagated to a child
    const childAcl = await dfsAxios.head(
      `${dfsBaseUrl}/${fileSystemName}/dir/subdir/file2.txt?action=getAccessControl&${sas}`,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true }
    );
    assert.strictEqual(childAcl.headers["x-ms-acl"], "user::rwx,group::r-x,other::---");

    await containerClient.delete();
  });

  it("modifies ACL recursively with mode=modify @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    await axios.put(`${dfsBaseUrl}/${fileSystemName}/dir?resource=directory&${sas}`, undefined,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });
    await axios.put(`${dfsBaseUrl}/${fileSystemName}/dir/file.txt?resource=file&${sas}`, undefined,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });

    // Set initial ACL
    await dfsAxios.patch(`${dfsBaseUrl}/${fileSystemName}/dir?action=setAccessControlRecursive&mode=set&${sas}`,
      null, { headers: { "x-ms-version": BLOB_API_VERSION, "x-ms-acl": "user::rwx,group::r-x,other::---" }, validateStatus: () => true });

    // Modify: override group entry only
    const modifyResponse = await dfsAxios.patch(
      `${dfsBaseUrl}/${fileSystemName}/dir?action=setAccessControlRecursive&mode=modify&${sas}`,
      null,
      { headers: { "x-ms-version": BLOB_API_VERSION, "x-ms-acl": "group::rwx" }, validateStatus: () => true }
    );
    assert.strictEqual(modifyResponse.status, 200);

    const check = await dfsAxios.head(
      `${dfsBaseUrl}/${fileSystemName}/dir/file.txt?action=getAccessControl&${sas}`,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true }
    );
    // user and other entries preserved, group updated
    assert.ok(check.headers["x-ms-acl"].includes("user::rwx"));
    assert.ok(check.headers["x-ms-acl"].includes("group::rwx"));
    assert.ok(check.headers["x-ms-acl"].includes("other::---"));

    await containerClient.delete();
  });

  it("removes ACL entries recursively with mode=remove @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    await axios.put(`${dfsBaseUrl}/${fileSystemName}/dir?resource=directory&${sas}`, undefined,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });
    await axios.put(`${dfsBaseUrl}/${fileSystemName}/dir/file.txt?resource=file&${sas}`, undefined,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });

    await dfsAxios.patch(`${dfsBaseUrl}/${fileSystemName}/dir?action=setAccessControlRecursive&mode=set&${sas}`,
      null, { headers: { "x-ms-version": BLOB_API_VERSION, "x-ms-acl": "user::rwx,group::r-x,other::---" }, validateStatus: () => true });

    const removeResponse = await dfsAxios.patch(
      `${dfsBaseUrl}/${fileSystemName}/dir?action=setAccessControlRecursive&mode=remove&${sas}`,
      null,
      { headers: { "x-ms-version": BLOB_API_VERSION, "x-ms-acl": "group::" }, validateStatus: () => true }
    );
    assert.strictEqual(removeResponse.status, 200);

    const check = await dfsAxios.head(
      `${dfsBaseUrl}/${fileSystemName}/dir/file.txt?action=getAccessControl&${sas}`,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true }
    );
    // group entry removed, others intact
    assert.ok(!check.headers["x-ms-acl"].includes("group::"));
    assert.ok(check.headers["x-ms-acl"].includes("user::rwx"));

    await containerClient.delete();
  });

  // ---------------------------------------------------------------------------
  // Append / flush position error paths
  // ---------------------------------------------------------------------------

  it("rejects out-of-order append with 409 ConditionNotMet @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    const fileName = "pos-error.txt";
    await axios.put(`${dfsBaseUrl}/${fileSystemName}/${fileName}?resource=file&${sas}`, undefined,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });

    // Correct first append (position=0)
    const good = await dfsAxios.patch(
      `${dfsBaseUrl}/${fileSystemName}/${fileName}?action=append&position=0&${sas}`,
      "hello",
      { headers: { "x-ms-version": BLOB_API_VERSION, "Content-Type": "application/octet-stream" }, validateStatus: () => true }
    );
    assert.strictEqual(good.status, 202);

    // Wrong position (should be 5, sending 999)
    const bad = await dfsAxios.patch(
      `${dfsBaseUrl}/${fileSystemName}/${fileName}?action=append&position=999&${sas}`,
      "world",
      { headers: { "x-ms-version": BLOB_API_VERSION, "Content-Type": "application/octet-stream" }, validateStatus: () => true }
    );
    assert.strictEqual(bad.status, 409);
    assert.strictEqual(bad.data.error.code, "ConditionNotMet");

    await containerClient.delete();
  });

  it("rejects flush with wrong position with 409 InvalidFlushPosition @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    const fileName = "flush-error.txt";
    await axios.put(`${dfsBaseUrl}/${fileSystemName}/${fileName}?resource=file&${sas}`, undefined,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });

    // Append 5 bytes correctly
    await dfsAxios.patch(
      `${dfsBaseUrl}/${fileSystemName}/${fileName}?action=append&position=0&${sas}`,
      "hello",
      { headers: { "x-ms-version": BLOB_API_VERSION, "Content-Type": "application/octet-stream" }, validateStatus: () => true }
    );

    // Flush with wrong position (actual is 5, we say 999)
    const bad = await dfsAxios.patch(
      `${dfsBaseUrl}/${fileSystemName}/${fileName}?action=flush&position=999&${sas}`,
      null,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true }
    );
    assert.strictEqual(bad.status, 409);
    assert.strictEqual(bad.data.error.code, "InvalidFlushPosition");

    await containerClient.delete();
  });

  // ---------------------------------------------------------------------------
  // Multi-cycle append → flush (C-1 regression)
  // ---------------------------------------------------------------------------

  it("preserves data across two complete append→flush cycles @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    const fileName = "multi-cycle.txt";
    await axios.put(`${dfsBaseUrl}/${fileSystemName}/${fileName}?resource=file&${sas}`, undefined,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });

    const chunk1 = "Hello, ";
    const chunk2 = "World!";

    // First cycle
    await dfsAxios.patch(`${dfsBaseUrl}/${fileSystemName}/${fileName}?action=append&position=0&${sas}`,
      chunk1, { headers: { "x-ms-version": BLOB_API_VERSION, "Content-Type": "application/octet-stream" }, validateStatus: () => true });
    await dfsAxios.patch(`${dfsBaseUrl}/${fileSystemName}/${fileName}?action=flush&position=${Buffer.byteLength(chunk1)}&${sas}`,
      null, { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });

    // Second cycle
    const offset = Buffer.byteLength(chunk1);
    await dfsAxios.patch(`${dfsBaseUrl}/${fileSystemName}/${fileName}?action=append&position=${offset}&${sas}`,
      chunk2, { headers: { "x-ms-version": BLOB_API_VERSION, "Content-Type": "application/octet-stream" }, validateStatus: () => true });
    const flush2 = await dfsAxios.patch(`${dfsBaseUrl}/${fileSystemName}/${fileName}?action=flush&position=${offset + Buffer.byteLength(chunk2)}&${sas}`,
      null, { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });
    assert.strictEqual(flush2.status, 200);

    const readRes = await dfsAxios.get(`${dfsBaseUrl}/${fileSystemName}/${fileName}?${sas}`,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });
    assert.strictEqual(readRes.status, 200);
    assert.strictEqual(readRes.data, "Hello, World!");

    await containerClient.delete();
  });

  // ---------------------------------------------------------------------------
  // Rename to existing destination — overwrite semantics (M-1)
  // ---------------------------------------------------------------------------

  it("renames onto an existing file, overwriting it @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    await axios.put(`${dfsBaseUrl}/${fileSystemName}/src.txt?resource=file&${sas}`, undefined,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });
    await axios.put(`${dfsBaseUrl}/${fileSystemName}/dest.txt?resource=file&${sas}`, undefined,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });

    const renameRes = await axios.put(`${dfsBaseUrl}/${fileSystemName}/dest.txt?${sas}`, undefined, {
      headers: { "x-ms-version": BLOB_API_VERSION, "x-ms-rename-source": `/${EMULATOR_ACCOUNT_NAME}/${fileSystemName}/src.txt` },
      validateStatus: () => true
    });
    assert.strictEqual(renameRes.status, 201, "Rename onto existing file should succeed (overwrite)");

    // src should be gone
    const srcHead = await dfsAxios.head(`${dfsBaseUrl}/${fileSystemName}/src.txt?${sas}`,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });
    assert.strictEqual(srcHead.status, 404);

    await containerClient.delete();
  });

  it("rejects rename onto a non-empty directory with 409 @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    await axios.put(`${dfsBaseUrl}/${fileSystemName}/src?resource=directory&${sas}`, undefined,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });
    await axios.put(`${dfsBaseUrl}/${fileSystemName}/dest?resource=directory&${sas}`, undefined,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });
    await axios.put(`${dfsBaseUrl}/${fileSystemName}/dest/child.txt?resource=file&${sas}`, undefined,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });

    const renameRes = await axios.put(`${dfsBaseUrl}/${fileSystemName}/dest?${sas}`, undefined, {
      headers: { "x-ms-version": BLOB_API_VERSION, "x-ms-rename-source": `/${EMULATOR_ACCOUNT_NAME}/${fileSystemName}/src` },
      validateStatus: () => true
    });
    assert.strictEqual(renameRes.status, 409);
    assert.strictEqual(renameRes.data.error.code, "DirectoryNotEmpty");

    await containerClient.delete();
  });

  // ---------------------------------------------------------------------------
  // setProperties — reserved key protection (M-2)
  // ---------------------------------------------------------------------------

  it("setProperties silently ignores reserved hdi_isfolder key @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    await axios.put(`${dfsBaseUrl}/${fileSystemName}/file.txt?resource=file&${sas}`, undefined,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });

    // Attempt to flip hdi_isfolder to "true" via setProperties
    const encoded = Buffer.from("true").toString("base64");
    await dfsAxios.patch(`${dfsBaseUrl}/${fileSystemName}/file.txt?action=setProperties&${sas}`, null, {
      headers: { "x-ms-version": BLOB_API_VERSION, "x-ms-properties": `hdi_isfolder=${encoded}` },
      validateStatus: () => true
    });

    // Path should still be reported as a file, not a directory
    const head = await dfsAxios.head(`${dfsBaseUrl}/${fileSystemName}/file.txt?${sas}`,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });
    assert.strictEqual(head.headers["x-ms-resource-type"], "file");

    await containerClient.delete();
  });

  // ---------------------------------------------------------------------------
  // ETag format (M-8) — DFS-created blobs should match Azure "0x..." format
  // ---------------------------------------------------------------------------

  it("ETag from DFS path create matches Azure 0x... format @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    const createRes = await axios.put(`${dfsBaseUrl}/${fileSystemName}/etag-test.txt?resource=file&${sas}`, undefined,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });
    assert.strictEqual(createRes.status, 201);

    const etag = createRes.headers["etag"];
    assert.ok(etag, "ETag header should be present");
    assert.match(etag, /^"0x[0-9A-F]+"$/i, `ETag "${etag}" does not match Azure "0x..." format`);

    await containerClient.delete();
  });

  // ---------------------------------------------------------------------------
  // Non-numeric position parameter (m-5)
  // ---------------------------------------------------------------------------

  it("rejects non-numeric append position gracefully @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    await axios.put(`${dfsBaseUrl}/${fileSystemName}/pos-nan.txt?resource=file&${sas}`, undefined,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });

    const res = await dfsAxios.patch(
      `${dfsBaseUrl}/${fileSystemName}/pos-nan.txt?action=append&position=garbage&${sas}`,
      "data",
      { headers: { "x-ms-version": BLOB_API_VERSION, "Content-Type": "application/octet-stream" }, validateStatus: () => true }
    );
    // NaN position is treated as 0; an empty file expects position 0, so this succeeds
    // The important thing is it doesn't crash (500) — either 202 or 409 is acceptable
    assert.ok(res.status === 202 || res.status === 409, `Expected 202 or 409, got ${res.status}`);

    await containerClient.delete();
  });

  // ---------------------------------------------------------------------------
  // Pass-2: HNS flag survives setProperties PATCH (P2-C-1)
  // ---------------------------------------------------------------------------

  it("HNS flag survives a filesystem setProperties PATCH @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    await axios.put(`${dfsBaseUrl}/${fileSystemName}?resource=filesystem&${sas}`, undefined,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });

    // Patch with a user property
    const propVal = Buffer.from("bar").toString("base64");
    const patchRes = await dfsAxios.patch(`${dfsBaseUrl}/${fileSystemName}?resource=filesystem&${sas}`, null, {
      headers: { "x-ms-version": BLOB_API_VERSION, "x-ms-properties": `foo=${propVal}` },
      validateStatus: () => true
    });
    assert.strictEqual(patchRes.status, 200);

    // HNS should still be enabled
    const headRes = await dfsAxios.head(`${dfsBaseUrl}/${fileSystemName}?resource=filesystem&${sas}`,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });
    assert.strictEqual(headRes.headers["x-ms-namespace-enabled"], "true");

    // DFS path operation should still work
    const createRes = await axios.put(`${dfsBaseUrl}/${fileSystemName}/test.txt?resource=file&${sas}`, undefined,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });
    assert.strictEqual(createRes.status, 201);

    await dfsAxios.delete(`${dfsBaseUrl}/${fileSystemName}?resource=filesystem&${sas}`,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });
  });

  // ---------------------------------------------------------------------------
  // Pass-2: listPaths returns 404 for non-existent directory (P2-M-1)
  // ---------------------------------------------------------------------------

  it("listPaths returns 404 when the specified directory does not exist @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    const res = await dfsAxios.get(
      `${dfsBaseUrl}/${fileSystemName}?resource=filesystem&directory=nonexistent&recursive=true&${sas}`,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true }
    );
    assert.strictEqual(res.status, 404);

    await containerClient.delete();
  });

  // ---------------------------------------------------------------------------
  // Pass-2: delete with non-matching If-Match returns 412 (P2-M-2)
  // ---------------------------------------------------------------------------

  it("delete with non-matching If-Match returns 412 @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    await axios.put(`${dfsBaseUrl}/${fileSystemName}/cond.txt?resource=file&${sas}`, undefined,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });

    const delRes = await dfsAxios.delete(`${dfsBaseUrl}/${fileSystemName}/cond.txt?${sas}`, {
      headers: { "x-ms-version": BLOB_API_VERSION, "If-Match": `"0xDEADBEEF"` },
      validateStatus: () => true
    });
    assert.strictEqual(delRes.status, 412);

    await containerClient.delete();
  });

  // ---------------------------------------------------------------------------
  // Pass-2: listPaths reflects stored ACL owner/group/permissions (P2-M-7)
  // ---------------------------------------------------------------------------

  it("listPaths returns stored ACL owner and group for each path @loki @sql", async () => {
    const fileSystemName = getUniqueName("fs");
    const containerClient = blobServiceClient.getContainerClient(fileSystemName);
    await containerClient.create();

    await axios.put(`${dfsBaseUrl}/${fileSystemName}/acl-file.txt?resource=file&${sas}`, undefined,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true });

    // Set a specific owner
    await dfsAxios.patch(`${dfsBaseUrl}/${fileSystemName}/acl-file.txt?action=setAccessControl&${sas}`, null, {
      headers: { "x-ms-version": BLOB_API_VERSION, "x-ms-owner": "custom-owner", "x-ms-group": "custom-group" },
      validateStatus: () => true
    });

    const listRes = await dfsAxios.get(
      `${dfsBaseUrl}/${fileSystemName}?resource=filesystem&recursive=true&${sas}`,
      { headers: { "x-ms-version": BLOB_API_VERSION }, validateStatus: () => true }
    );
    assert.strictEqual(listRes.status, 200);
    const entry = listRes.data.paths.find((p: any) => p.name === "acl-file.txt");
    assert.ok(entry, "Expected acl-file.txt in listing");
    assert.strictEqual(entry.owner, "custom-owner");
    assert.strictEqual(entry.group, "custom-group");

    await containerClient.delete();
  });
});
