import * as assert from "assert";

import { URLBuilder } from "@azure/ms-rest-js";
import {
  AccountSASPermissions,
  AccountSASResourceTypes,
  AccountSASServices,
  AnonymousCredential,
  AppendBlobClient,
  BlobSASPermissions,
  BlobServiceClient,
  ContainerClient,
  ContainerSASPermissions,
  generateAccountSASQueryParameters,
  generateBlobSASQueryParameters,
  newPipeline,
  PageBlobClient,
  SASProtocol,
  StorageSharedKeyCredential
} from "@azure/storage-blob";

import {
  EMULATOR_ACCOUNT_KEY_STR,
  EMULATOR_ACCOUNT_NAME
} from "../../src/blob/utils/constants";
import { configLogger } from "../../src/common/Logger";
import { getUniqueName } from "../testutils";
import DataLakeTestServerFactory from "./DataLakeTestServerFactory";

const EMULATOR_ACCOUNT2_NAME = "devstoreaccount2";
const EMULATOR_ACCOUNT2_KEY_STR =
  "MTAwCjE2NQoyMjUKMTAzCjIxOAoyNDEKNDAKNzgKMTkxCjE3OAoyMTQKMTY5CjIxMwo2MQoyNTIKMTQxCg==";

// Set true to enable debug log
configLogger(false);

describe("Shared Access Signature (SAS) authentication", () => {
  // Setup two accounts for validating cross-account copy operations
  process.env[
    "AZURITE_ACCOUNTS"
  ] = `${EMULATOR_ACCOUNT_NAME}:${EMULATOR_ACCOUNT_KEY_STR};${EMULATOR_ACCOUNT2_NAME}:${EMULATOR_ACCOUNT2_KEY_STR}`;

  const factory = new DataLakeTestServerFactory();
  const server = factory.createServer();

  const baseURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1`;
  const serviceClient = new BlobServiceClient(
    baseURL,
    newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY_STR
      ),
      {
        retryOptions: { maxTries: 1 },
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      }
    )
  );

  const baseURL2 = `http://${server.config.host}:${server.config.port}/devstoreaccount2`;
  const serviceClient2 = new BlobServiceClient(
    baseURL2,
    newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT2_NAME,
        EMULATOR_ACCOUNT2_KEY_STR
      ),
      {
        retryOptions: { maxTries: 1 },
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      }
    )
  );

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  it("generateAccountSASQueryParameters should work @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlacup"),
        protocol: SASProtocol.HttpsAndHttp,
        resourceTypes: AccountSASResourceTypes.parse("sco").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        startsOn: now,
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sasURL = `${serviceClient.url}?${sas}`;
    const serviceClientWithSAS = new BlobServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential(), {
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    await serviceClientWithSAS.getAccountInfo();
  });

  it("generateAccountSASQueryParameters should work for set blob tier @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("w"),
        protocol: SASProtocol.HttpsAndHttp,
        resourceTypes: AccountSASResourceTypes.parse("sco").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        startsOn: now,
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sasURL = `${serviceClient.url}?${sas}`;
    const serviceClientWithSAS = new BlobServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential(), {
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const containerClientWithSAS = serviceClientWithSAS.getContainerClient(
      getUniqueName("con")
    );
    await containerClientWithSAS.create();

    const blockBlobClientWithSAS = containerClientWithSAS.getBlockBlobClient(
      getUniqueName("blob")
    );
    await blockBlobClientWithSAS.upload("abc", 3);

    await blockBlobClientWithSAS.setAccessTier("Hot");
  });

  it("generateAccountSASQueryParameters should not work with invalid permission @Loki @sql", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        permissions: AccountSASPermissions.parse("wdlcup"),
        resourceTypes: AccountSASResourceTypes.parse("sco").toString(),
        services: AccountSASServices.parse("btqf").toString()
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sasURL = `${serviceClient.url}?${sas}`;
    const serviceClientWithSAS = new BlobServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential(), {
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    let error;
    try {
      await serviceClientWithSAS.getProperties();
    } catch (err) {
      error = err;
    }

    assert.ok(error);
  });

  it("generateAccountSASQueryParameters should not work with invalid service @Loki @sql", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        permissions: AccountSASPermissions.parse("rwdlacup"),
        resourceTypes: AccountSASResourceTypes.parse("sco").toString(),
        services: AccountSASServices.parse("tqf").toString()
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sasURL = `${serviceClient.url}?${sas}`;
    const serviceClientWithSAS = new BlobServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential(), {
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    let error;
    try {
      await serviceClientWithSAS.getProperties();
    } catch (err) {
      error = err;
    }

    assert.ok(error);
  });

  it("generateAccountSASQueryParameters should not work with invalid resource type @Loki @sql", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlacup"),
        protocol: SASProtocol.HttpsAndHttp,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sasURL = `${serviceClient.url}?${sas}`;
    const serviceClientWithSAS = new BlobServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential(), {
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    let error;
    try {
      await serviceClientWithSAS.getProperties();
    } catch (err) {
      error = err;
    }

    assert.ok(error);
  });

  it("Synchronized copy blob should work with write permission in account SAS to override an existing blob @Loki @sql", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlacup"),
        protocol: SASProtocol.HttpsAndHttp,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sasURL = `${serviceClient.url}?${sas}`;
    const serviceClientWithSAS = new BlobServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential(), {
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const containerName = getUniqueName("con");
    const containerClient =
      serviceClientWithSAS.getContainerClient(containerName);
    await containerClient.create();

    const blobName1 = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const blob1 = containerClient.getBlockBlobClient(blobName1);
    const blob2 = containerClient.getBlockBlobClient(blobName2);

    await blob1.upload("hello", 5);
    await blob2.syncCopyFromURL(blob1.url);

    // this copy should not throw any errors
    await blob2.syncCopyFromURL(blob1.url);
  });

  it("Synchronized copy blob shouldn't work without write permission in account SAS to override an existing blob @Loki @sql", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rdlacup"),
        protocol: SASProtocol.HttpsAndHttp,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sasURL = `${serviceClient.url}?${sas}`;
    const serviceClientWithSAS = new BlobServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential(), {
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const containerName = getUniqueName("con");
    const containerClient =
      serviceClientWithSAS.getContainerClient(containerName);
    await containerClient.create();

    const blobName1 = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const blob1 = containerClient.getBlockBlobClient(blobName1);
    const blob2 = containerClient.getBlockBlobClient(blobName2);

    await blob1.upload("hello", 5);
    await blob2.syncCopyFromURL(blob1.url);

    // this copy should throw 403 error
    let error;
    try {
      await blob2.syncCopyFromURL(blob1.url);
    } catch (err) {
      error = err;
    }
    assert.deepEqual(error.statusCode, 403);
    assert.ok(error !== undefined);
  });

  it("Synchronized copy blob should work without write permission in account SAS to an nonexisting blob @Loki @sql", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("c"),
        protocol: SASProtocol.HttpsAndHttp,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sasURL = `${serviceClient.url}?${sas}`;
    const serviceClientWithSAS = new BlobServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential(), {
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const containerName = getUniqueName("con");
    const containerClient =
      serviceClientWithSAS.getContainerClient(containerName);
    await containerClient.create();

    const blobName1 = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const blob1 = containerClient.getBlockBlobClient(blobName1);
    const blob2 = containerClient.getBlockBlobClient(blobName2);

    await blob1.upload("hello", 5);

    // this copy should work
    await blob2.syncCopyFromURL(blob1.url);
  });

  it("Copy blob should work with write permission in account SAS to override an existing blob @Loki @sql", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlacup"),
        protocol: SASProtocol.HttpsAndHttp,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sasURL = `${serviceClient.url}?${sas}`;
    const serviceClientWithSAS = new BlobServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential(), {
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const containerName = getUniqueName("con");
    const containerClient =
      serviceClientWithSAS.getContainerClient(containerName);
    await containerClient.create();

    const blobName1 = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const blob1 = containerClient.getBlockBlobClient(blobName1);
    const blob2 = containerClient.getBlockBlobClient(blobName2);

    await blob1.upload("hello", 5);
    await blob2.beginCopyFromURL(blob1.url);

    // this copy should not throw any errors
    await blob2.beginCopyFromURL(blob1.url);
  });

  it("Copy blob shouldn't work without write permission in account SAS to override an existing blob @Loki @sql", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rdlacup"),
        protocol: SASProtocol.HttpsAndHttp,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sasURL = `${serviceClient.url}?${sas}`;
    const serviceClientWithSAS = new BlobServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential(), {
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const containerName = getUniqueName("con");
    const containerClient =
      serviceClientWithSAS.getContainerClient(containerName);
    await containerClient.create();

    const blobName1 = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const blob1 = containerClient.getBlockBlobClient(blobName1);
    const blob2 = containerClient.getBlockBlobClient(blobName2);

    await blob1.upload("hello", 5);
    await blob2.beginCopyFromURL(blob1.url);

    // this copy should throw 403 error
    let error;
    try {
      await blob2.beginCopyFromURL(blob1.url);
    } catch (err) {
      error = err;
    }
    assert.deepEqual(error.statusCode, 403);
    assert.ok(error !== undefined);
  });

  it("Copy blob should work without write permission in account SAS to an nonexisting blob @Loki @sql", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("c"),
        protocol: SASProtocol.HttpsAndHttp,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sasURL = `${serviceClient.url}?${sas}`;
    const serviceClientWithSAS = new BlobServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential(), {
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const containerName = getUniqueName("con");
    const containerClient =
      serviceClientWithSAS.getContainerClient(containerName);
    await containerClient.create();

    const blobName1 = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const blob1 = containerClient.getBlockBlobClient(blobName1);
    const blob2 = containerClient.getBlockBlobClient(blobName2);

    await blob1.upload("hello", 5);

    // this copy should work
    await blob2.beginCopyFromURL(blob1.url);
  });

  it("generateBlobSASQueryParameters should work for container @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const containerSAS = generateBlobSASQueryParameters(
      {
        containerName,
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: ContainerSASPermissions.parse("racwdl"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${containerClient.url}?${containerSAS}`;
    const containerClientWithSAS = new ContainerClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    await await containerClientWithSAS.listBlobsFlat().byPage();
    await containerClient.delete();
  });

  it("generateBlobSASQueryParameters should work for page blob with original headers @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const blobName = getUniqueName("blob");
    const blobClient = containerClient.getPageBlobClient(blobName);
    await blobClient.create(1024, {
      blobHTTPHeaders: {
        blobCacheControl: "cache-control-original",
        blobContentType: "content-type-original",
        blobContentDisposition: "content-disposition-original",
        blobContentEncoding: "content-encoding-original",
        blobContentLanguage: "content-language-original"
      }
    });

    const blobSAS = generateBlobSASQueryParameters(
      {
        blobName,
        containerName,
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: BlobSASPermissions.parse("racwd"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${blobClient.url}?${blobSAS}`;
    const blobClientWithSAS = new PageBlobClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    await blobClientWithSAS.getProperties();

    const properties = await blobClientWithSAS.getProperties();
    assert.equal(properties.cacheControl, "cache-control-original");
    assert.equal(properties.contentDisposition, "content-disposition-original");
    assert.equal(properties.contentEncoding, "content-encoding-original");
    assert.equal(properties.contentLanguage, "content-language-original");
    assert.equal(properties.contentType, "content-type-original");

    const downloadResponse = await blobClientWithSAS.download();
    assert.equal(downloadResponse.cacheControl, "cache-control-original");
    assert.equal(
      downloadResponse.contentDisposition,
      "content-disposition-original"
    );
    assert.equal(downloadResponse.contentEncoding, "content-encoding-original");
    assert.equal(downloadResponse.contentLanguage, "content-language-original");
    assert.equal(downloadResponse.contentType, "content-type-original");

    await containerClient.delete();
  });

  it("generateBlobSASQueryParameters should work for page blob and rscd arguments for filenames with spaces and special characters @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const blobName = "this is a test file Ж 大 仮.jpg"; //filename contains spaces and special characters
    const blobClient = containerClient.getPageBlobClient(blobName);
    await blobClient.create(1024, {
      blobHTTPHeaders: {
        blobCacheControl: "cache-control-original",
        blobContentType: "content-type-original",
        blobContentDisposition: "content-type-disposition",
        blobContentEncoding: "content-encoding-original",
        blobContentLanguage: "content-language-original"
      }
    });

    const escapedblobName = encodeURIComponent(blobName);
    const blobSAS = generateBlobSASQueryParameters(
      {
        blobName,
        containerName,
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: BlobSASPermissions.parse("racwd"),
        protocol: SASProtocol.HttpsAndHttp,
        //https://tools.ietf.org/html/rfc5987
        contentDisposition: `attachment; filename=\"${escapedblobName}\"; filename*=UTF-8''${escapedblobName}`,
        startsOn: now,
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${blobClient.url}?${blobSAS}`;
    const blobClientWithSAS = new PageBlobClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    await blobClientWithSAS.getProperties();

    const properties = await blobClientWithSAS.getProperties();
    assert.equal(properties.cacheControl, "cache-control-original");
    assert.equal(
      properties.contentDisposition,
      `attachment; filename=\"${escapedblobName}\"; filename*=UTF-8''${escapedblobName}`
    );
    assert.equal(properties.contentEncoding, "content-encoding-original");
    assert.equal(properties.contentLanguage, "content-language-original");
    assert.equal(properties.contentType, "content-type-original");

    const downloadResponse = await blobClientWithSAS.download();
    assert.equal(downloadResponse.cacheControl, "cache-control-original");
    assert.equal(
      downloadResponse.contentDisposition,
      `attachment; filename=\"${escapedblobName}\"; filename*=UTF-8''${escapedblobName}`
    );
    assert.equal(downloadResponse.contentEncoding, "content-encoding-original");
    assert.equal(downloadResponse.contentLanguage, "content-language-original");
    assert.equal(downloadResponse.contentType, "content-type-original");

    await containerClient.delete();
  });

  it("generateBlobSASQueryParameters should work for page blob and override headers @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const blobName = getUniqueName("blob");
    const blobClient = containerClient.getPageBlobClient(blobName);
    await blobClient.create(1024, {
      blobHTTPHeaders: {
        blobContentType: "content-type-original"
      }
    });

    const blobSAS = generateBlobSASQueryParameters(
      {
        blobName,
        cacheControl: "cache-control-override",
        containerName,
        contentDisposition: "content-disposition-override",
        contentEncoding: "content-encoding-override",
        contentLanguage: "content-language-override",
        contentType: "content-type-override",
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: BlobSASPermissions.parse("racwd"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${blobClient.url}?${blobSAS}`;
    const blobClientWithSAS = new PageBlobClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    await blobClientWithSAS.getProperties();

    const properties = await blobClientWithSAS.getProperties();
    assert.equal(properties.cacheControl, "cache-control-override");
    assert.equal(properties.contentDisposition, "content-disposition-override");
    assert.equal(properties.contentEncoding, "content-encoding-override");
    assert.equal(properties.contentLanguage, "content-language-override");
    assert.equal(properties.contentType, "content-type-override");

    const downloadResponse = await blobClientWithSAS.download();
    assert.equal(downloadResponse.cacheControl, "cache-control-override");
    assert.equal(
      downloadResponse.contentDisposition,
      "content-disposition-override"
    );
    assert.equal(downloadResponse.contentEncoding, "content-encoding-override");
    assert.equal(downloadResponse.contentLanguage, "content-language-override");
    assert.equal(downloadResponse.contentType, "content-type-override");

    await containerClient.delete();
  });

  it("generateBlobSASQueryParameters should work for append blob with original headers @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const blobName = getUniqueName("blob");
    const blobClient = containerClient.getAppendBlobClient(blobName);
    await blobClient.create({
      blobHTTPHeaders: {
        blobCacheControl: "cache-control-original",
        blobContentType: "content-type-original",
        blobContentDisposition: "content-disposition-original",
        blobContentEncoding: "content-encoding-original",
        blobContentLanguage: "content-language-original"
      }
    });

    const blobSAS = generateBlobSASQueryParameters(
      {
        blobName,
        containerName,
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: BlobSASPermissions.parse("racwd"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${blobClient.url}?${blobSAS}`;
    const blobClientWithSAS = new AppendBlobClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    await blobClientWithSAS.getProperties();

    const properties = await blobClientWithSAS.getProperties();
    assert.equal(properties.cacheControl, "cache-control-original");
    assert.equal(properties.contentDisposition, "content-disposition-original");
    assert.equal(properties.contentEncoding, "content-encoding-original");
    assert.equal(properties.contentLanguage, "content-language-original");
    assert.equal(properties.contentType, "content-type-original");

    const downloadResponse = await blobClientWithSAS.download();
    assert.equal(downloadResponse.cacheControl, "cache-control-original");
    assert.equal(
      downloadResponse.contentDisposition,
      "content-disposition-original"
    );
    assert.equal(downloadResponse.contentEncoding, "content-encoding-original");
    assert.equal(downloadResponse.contentLanguage, "content-language-original");
    assert.equal(downloadResponse.contentType, "content-type-original");

    await containerClient.delete();
  });

  it("generateBlobSASQueryParameters should work for append blob and override headers @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const blobName = getUniqueName("blob");
    const blobClient = containerClient.getAppendBlobClient(blobName);
    await blobClient.create({
      blobHTTPHeaders: {
        blobContentType: "content-type-original"
      }
    });

    const blobSAS = generateBlobSASQueryParameters(
      {
        blobName,
        cacheControl: "cache-control-override",
        containerName,
        contentDisposition: "content-disposition-override",
        contentEncoding: "content-encoding-override",
        contentLanguage: "content-language-override",
        contentType: "content-type-override",
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: BlobSASPermissions.parse("racwd"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${blobClient.url}?${blobSAS}`;
    const blobClientWithSAS = new AppendBlobClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    await blobClientWithSAS.getProperties();

    const properties = await blobClientWithSAS.getProperties();
    assert.equal(properties.cacheControl, "cache-control-override");
    assert.equal(properties.contentDisposition, "content-disposition-override");
    assert.equal(properties.contentEncoding, "content-encoding-override");
    assert.equal(properties.contentLanguage, "content-language-override");
    assert.equal(properties.contentType, "content-type-override");

    const downloadResponse = await blobClientWithSAS.download();
    assert.equal(downloadResponse.cacheControl, "cache-control-override");
    assert.equal(
      downloadResponse.contentDisposition,
      "content-disposition-override"
    );
    assert.equal(downloadResponse.contentEncoding, "content-encoding-override");
    assert.equal(downloadResponse.contentLanguage, "content-language-override");
    assert.equal(downloadResponse.contentType, "content-type-override");

    await containerClient.delete();
  });

  it("generateBlobSASQueryParameters should work for blob with special naming @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container-with-dash");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const blobName = getUniqueName(
      // tslint:disable-next-line:max-line-length
      "////Upper/blob/empty /another 汉字 ру́сский язы́к ру́сский язы́к عربي/عربى にっぽんご/にほんご . special ~!@#$%^&*()_+`1234567890-={}|[]\\:\";'<>?,/'"
    );
    const blobClient = containerClient.getPageBlobClient(blobName);
    await blobClient.create(1024, {
      blobHTTPHeaders: {
        blobContentType: "content-type-original"
      }
    });

    const blobSAS = generateBlobSASQueryParameters(
      {
        // blobName,
        // //Caused an issue
        // NOTICE: Azure Storage Server will replace "\" with "/" in the blob names
        blobName: blobName.replace(/\\/g, "/"),
        cacheControl: "cache-control-override",
        containerName,
        contentDisposition: "content-disposition-override",
        contentEncoding: "content-encoding-override",
        contentLanguage: "content-language-override",
        contentType: "content-type-override",
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: BlobSASPermissions.parse("racwd"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${blobClient.url}?${blobSAS}`;
    const blobClientWithSAS = new PageBlobClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    await blobClientWithSAS.getProperties();

    const properties = await blobClientWithSAS.getProperties();
    assert.equal(properties.cacheControl, "cache-control-override");
    assert.equal(properties.contentDisposition, "content-disposition-override");
    assert.equal(properties.contentEncoding, "content-encoding-override");
    assert.equal(properties.contentLanguage, "content-language-override");
    assert.equal(properties.contentType, "content-type-override");

    const downloadResponse = await blobClientWithSAS.download();
    assert.equal(downloadResponse.cacheControl, "cache-control-override");
    assert.equal(
      downloadResponse.contentDisposition,
      "content-disposition-override"
    );
    assert.equal(downloadResponse.contentEncoding, "content-encoding-override");
    assert.equal(downloadResponse.contentLanguage, "content-language-override");
    assert.equal(downloadResponse.contentType, "content-type-override");

    await containerClient.delete();
  });

  it("generateBlobSASQueryParameters should work for blob with access policy @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const blobName = getUniqueName("blob");
    const blobClient = containerClient.getPageBlobClient(blobName);
    await blobClient.create(1024);

    const id = "unique-id";
    const result = await containerClient.setAccessPolicy(undefined, [
      {
        accessPolicy: {
          expiresOn: tmr,
          permissions: ContainerSASPermissions.parse("racwdl").toString(),
          startsOn: now
        },
        id
      }
    ]);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    const blobSAS = generateBlobSASQueryParameters(
      {
        containerName,
        identifier: id
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${blobClient.url}?${blobSAS}`;
    const blobClientWithSAS = new PageBlobClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    await blobClientWithSAS.getProperties();
    await containerClient.delete();
  });

  it("Synchronized copy blob should work with write permission in blob SAS to override an existing blob @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const containerSAS = generateBlobSASQueryParameters(
      {
        containerName,
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: ContainerSASPermissions.parse("w"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${containerClient.url}?${containerSAS}`;
    const containerClientWithSAS = new ContainerClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    const blobName1 = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const blob1 = containerClient.getBlockBlobClient(blobName1);
    const blob2 = containerClient.getBlockBlobClient(blobName2);
    const blob2SAS = containerClientWithSAS.getBlockBlobClient(blobName2);

    await blob1.upload("hello", 5);
    await blob2.upload("world", 5);

    // this copy should not throw any errors
    await blob2SAS.syncCopyFromURL(blob1.url);
  });

  it("Synchronized copy blob shouldn't work without write permission in blob SAS to override an existing blob @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const containerSAS = generateBlobSASQueryParameters(
      {
        containerName,
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: ContainerSASPermissions.parse("c"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${containerClient.url}?${containerSAS}`;
    const containerClientWithSAS = new ContainerClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    const blobName1 = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const blob1 = containerClient.getBlockBlobClient(blobName1);
    const blob2 = containerClient.getBlockBlobClient(blobName2);
    const blob2SAS = containerClientWithSAS.getBlockBlobClient(blobName2);

    await blob1.upload("hello", 5);
    await blob2.upload("world", 5);

    // this copy should throw 403 error
    let error;
    try {
      await blob2SAS.syncCopyFromURL(blob1.url);
    } catch (err) {
      error = err;
    }
    assert.deepEqual(error.statusCode, 403);
    assert.ok(error !== undefined);
  });

  it("Synchronized copy blob should work without write permission in account SAS to an nonexisting blob @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const containerSAS = generateBlobSASQueryParameters(
      {
        containerName,
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: ContainerSASPermissions.parse("c"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${containerClient.url}?${containerSAS}`;
    const containerClientWithSAS = new ContainerClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    const blobName1 = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const blob1 = containerClient.getBlockBlobClient(blobName1);
    const blob2SAS = containerClientWithSAS.getBlockBlobClient(blobName2);

    await blob1.upload("hello", 5);

    // this copy should work
    await blob2SAS.syncCopyFromURL(blob1.url);
  });

  it("Copy blob should work with write permission in blob SAS to override an existing blob @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const containerSAS = generateBlobSASQueryParameters(
      {
        containerName,
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: ContainerSASPermissions.parse("w"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${containerClient.url}?${containerSAS}`;
    const containerClientWithSAS = new ContainerClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    const blobName1 = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const blob1 = containerClient.getBlockBlobClient(blobName1);
    const blob2 = containerClient.getBlockBlobClient(blobName2);
    const blob2SAS = containerClientWithSAS.getBlockBlobClient(blobName2);

    await blob1.upload("hello", 5);
    await blob2.upload("world", 5);

    // this copy should not throw any errors
    await blob2SAS.beginCopyFromURL(blob1.url);
  });

  it("Copy blob shouldn't work without write permission in blob SAS to override an existing blob @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const containerSAS = generateBlobSASQueryParameters(
      {
        containerName,
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: ContainerSASPermissions.parse("c"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${containerClient.url}?${containerSAS}`;
    const containerClientWithSAS = new ContainerClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    const blobName1 = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const blob1 = containerClient.getBlockBlobClient(blobName1);
    const blob2 = containerClient.getBlockBlobClient(blobName2);
    const blob2SAS = containerClientWithSAS.getBlockBlobClient(blobName2);

    await blob1.upload("hello", 5);
    await blob2.upload("world", 5);

    // this copy should throw 403 error
    let error;
    try {
      await blob2SAS.beginCopyFromURL(blob1.url);
    } catch (err) {
      error = err;
    }
    assert.deepEqual(error.statusCode, 403);
    assert.ok(error !== undefined);
  });

  it("Copy blob should work without write permission in account SAS to an nonexisting blob @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const containerSAS = generateBlobSASQueryParameters(
      {
        containerName,
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: ContainerSASPermissions.parse("c"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${containerClient.url}?${containerSAS}`;
    const containerClientWithSAS = new ContainerClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    const blobName1 = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const blob1 = containerClient.getBlockBlobClient(blobName1);
    const blob2SAS = containerClientWithSAS.getBlockBlobClient(blobName2);

    await blob1.upload("hello", 5);

    // this copy should work
    await blob2SAS.beginCopyFromURL(blob1.url);
  });

  it("GenerateUserDelegationSAS should work for blob snapshot @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const blobName = getUniqueName("blob");
    const blobClient = containerClient.getPageBlobClient(blobName);
    await blobClient.create(1024, {
      blobHTTPHeaders: {
        blobContentType: "content-type-original"
      }
    });
    const response = await blobClient.createSnapshot();

    const blobSAS = generateBlobSASQueryParameters(
      {
        blobName,
        cacheControl: "cache-control-override",
        containerName,
        contentDisposition: "content-disposition-override",
        contentEncoding: "content-encoding-override",
        contentLanguage: "content-language-override",
        contentType: "content-type-override",
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: BlobSASPermissions.parse("racwd"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        snapshotTime: response.snapshot
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${
      blobClient.withSnapshot(response.snapshot!).url
    }&${blobSAS}`;
    const blobClientWithSAS = new PageBlobClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    const properties = await blobClientWithSAS.getProperties();
    assert.ok(properties);
    assert.equal(properties.cacheControl, "cache-control-override");
    assert.equal(properties.contentDisposition, "content-disposition-override");
    assert.equal(properties.contentEncoding, "content-encoding-override");
    assert.equal(properties.contentLanguage, "content-language-override");
    assert.equal(properties.contentType, "content-type-override");

    const downloadResponse = await blobClientWithSAS.download();
    assert.equal(downloadResponse.cacheControl, "cache-control-override");
    assert.equal(
      downloadResponse.contentDisposition,
      "content-disposition-override"
    );
    assert.equal(downloadResponse.contentEncoding, "content-encoding-override");
    assert.equal(downloadResponse.contentLanguage, "content-language-override");
    assert.equal(downloadResponse.contentType, "content-type-override");

    await containerClient.delete();
  });

  it("Copy blob across accounts should require SAS token @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const sourceStorageSharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("con");
    const sourceContainerClient =
      serviceClient.getContainerClient(containerName);
    const targetContainerClient =
      serviceClient2.getContainerClient(containerName);
    await sourceContainerClient.create();
    await targetContainerClient.create();

    const blobName = getUniqueName("blob");
    const sas = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: BlobSASPermissions.parse("r"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      sourceStorageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sourceBlob = sourceContainerClient.getBlockBlobClient(blobName);
    await sourceBlob.upload("hello", 5);

    const targetBlob = targetContainerClient.getBlockBlobClient(blobName);

    let error;
    try {
      await targetBlob.beginCopyFromURL(sourceBlob.url);
    } catch (err) {
      error = err;
    }
    assert.ok(error !== undefined);
    assert.equal(error.statusCode, 403);
    assert.equal(error.details.errorCode, "CannotVerifyCopySource");
    assert.equal(error.details.code, "CannotVerifyCopySource");

    // this copy should work
    const operation = await targetBlob.beginCopyFromURL(
      `${sourceBlob.url}?${sas}`
    );
    const copyResponse = await operation.pollUntilDone();
    assert.equal("success", copyResponse.copyStatus);
    const fileBuffer = await targetBlob.downloadToBuffer();
    assert.equal(fileBuffer.toString(), "hello");
  });

  it("Copy blob across accounts should error if hosts mismatch @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    const containerName = getUniqueName("con");
    const sourceContainerClient =
      serviceClient.getContainerClient(containerName);
    const targetContainerClient =
      serviceClient2.getContainerClient(containerName);
    await sourceContainerClient.create();
    await targetContainerClient.create();

    const blobName = getUniqueName("blob");
    const sourceBlob = sourceContainerClient.getBlockBlobClient(blobName);
    await sourceBlob.upload("hello", 5);

    const targetBlob = targetContainerClient.getBlockBlobClient(blobName);
    const sourceUriBuilder = URLBuilder.parse(sourceBlob.url);
    sourceUriBuilder.setHost("somewhereelse");

    let error;
    try {
      await targetBlob.beginCopyFromURL(sourceUriBuilder.toString());
    } catch (err) {
      error = err;
    }
    assert.deepEqual(error.statusCode, 404);
    assert.ok(error !== undefined);
  });

  it("Copy blob across accounts should succeed for public blob access @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    const containerName = getUniqueName("con");
    const sourceContainerClient =
      serviceClient.getContainerClient(containerName);
    const targetContainerClient =
      serviceClient2.getContainerClient(containerName);
    await sourceContainerClient.create({
      access: "blob"
    });
    await targetContainerClient.create();

    const blobName = getUniqueName("blob");
    const sourceBlob = sourceContainerClient.getBlockBlobClient(blobName);
    await sourceBlob.upload("hello", 5);

    const targetBlob = targetContainerClient.getBlockBlobClient(blobName);
    const operation = await targetBlob.beginCopyFromURL(sourceBlob.url);
    const copyResponse = await operation.pollUntilDone();
    assert.equal("success", copyResponse.copyStatus);
    const fileBuffer = await targetBlob.downloadToBuffer();
    assert.equal(fileBuffer.toString(), "hello");
  });

  it("Copy blob across accounts should succeed for public container access @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    const containerName = getUniqueName("con");
    const sourceContainerClient =
      serviceClient.getContainerClient(containerName);
    const targetContainerClient =
      serviceClient2.getContainerClient(containerName);
    await sourceContainerClient.create({
      access: "container"
    });
    await targetContainerClient.create();

    const blobName = getUniqueName("blob");
    const sourceBlob = sourceContainerClient.getBlockBlobClient(blobName);
    await sourceBlob.upload("hello", 5);

    const targetBlob = targetContainerClient.getBlockBlobClient(blobName);
    const operation = await targetBlob.beginCopyFromURL(sourceBlob.url);
    const copyResponse = await operation.pollUntilDone();
    assert.equal("success", copyResponse.copyStatus);
    const fileBuffer = await targetBlob.downloadToBuffer();
    assert.equal(fileBuffer.toString(), "hello");
  });

  it("Copy blob across accounts should honor metadata when provided @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const sourceStorageSharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("con");
    const sourceContainerClient =
      serviceClient.getContainerClient(containerName);
    const targetContainerClient =
      serviceClient2.getContainerClient(containerName);
    await sourceContainerClient.create();
    await targetContainerClient.create();

    const blobName = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const sas = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: BlobSASPermissions.parse("r"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      sourceStorageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sourceBlob = sourceContainerClient.getBlockBlobClient(blobName);
    await sourceBlob.upload("hello", 5, {
      metadata: {
        foo: "1",
        bar: "2"
      }
    });

    const targetBlob = targetContainerClient.getBlockBlobClient(blobName);
    const operation = await targetBlob.beginCopyFromURL(
      `${sourceBlob.url}?${sas}`
    );
    const copyResponse = await operation.pollUntilDone();
    assert.equal("success", copyResponse.copyStatus);
    const properties = await targetBlob.getProperties();
    assert.equal(properties.metadata!["foo"], "1");
    assert.equal(properties.metadata!["bar"], "2");

    const targetBlobWithProps =
      targetContainerClient.getBlockBlobClient(blobName2);
    const operation2 = await targetBlobWithProps.beginCopyFromURL(
      `${sourceBlob.url}?${sas}`,
      {
        metadata: {
          baz: "3"
        }
      }
    );

    const copyResponse2 = await operation2.pollUntilDone();
    assert.equal("success", copyResponse2.copyStatus);
    const properties2 = await targetBlobWithProps.getProperties();
    assert.equal(properties2.metadata!["foo"], undefined);
    assert.equal(properties2.metadata!["bar"], undefined);
    assert.equal(properties2.metadata!["baz"], "3");
  });

  //flaky in sql
  it("Copy blob across accounts should fail if source is archived @Loki", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const sourceStorageSharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("con");
    const sourceContainerClient =
      serviceClient.getContainerClient(containerName);
    const targetContainerClient =
      serviceClient2.getContainerClient(containerName);
    await sourceContainerClient.create();
    await targetContainerClient.create();

    const blobName = getUniqueName("blob");
    const sas = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: BlobSASPermissions.parse("r"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      sourceStorageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sourceBlob = sourceContainerClient.getBlockBlobClient(blobName);
    await sourceBlob.upload("hello", 5);
    sourceBlob.setAccessTier("Archive");

    const targetBlob = targetContainerClient.getBlockBlobClient(blobName);

    let error;
    try {
      await targetBlob.beginCopyFromURL(`${sourceBlob.url}?${sas}`);
    } catch (err) {
      error = err;
    }
    assert.ok(error !== undefined);
    assert.equal(error.statusCode, 409);
    assert.equal(error.details.code, "BlobArchived");
  });

  it("Sync Copy blob across accounts should work and honor metadata when provided @Loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const sourceStorageSharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("con");
    const sourceContainerClient =
      serviceClient.getContainerClient(containerName);
    const targetContainerClient =
      serviceClient2.getContainerClient(containerName);
    await sourceContainerClient.create();
    await targetContainerClient.create();

    const blobName = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const sas = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: BlobSASPermissions.parse("r"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      sourceStorageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sourceBlob = sourceContainerClient.getBlockBlobClient(blobName);
    await sourceBlob.upload("hello", 5, {
      metadata: {
        foo: "1",
        bar: "2"
      }
    });

    // Copy From Uri
    const targetBlob = targetContainerClient.getBlockBlobClient(blobName);
    const targetBlobWithProps =
      targetContainerClient.getBlockBlobClient(blobName2);
    const copyResponse3 = await targetBlob.syncCopyFromURL(
      `${sourceBlob.url}?${sas}`
    );
    assert.equal("success", copyResponse3.copyStatus);
    const properties3 = await targetBlob.getProperties();
    assert.equal(properties3.metadata!["foo"], "1");
    assert.equal(properties3.metadata!["bar"], "2");

    const copyResponse4 = await targetBlobWithProps.syncCopyFromURL(
      `${sourceBlob.url}?${sas}`,
      {
        metadata: {
          baz: "3"
        }
      }
    );

    assert.equal("success", copyResponse4.copyStatus);
    const properties4 = await targetBlobWithProps.getProperties();
    assert.equal(properties4.metadata!["foo"], undefined);
    assert.equal(properties4.metadata!["bar"], undefined);
    assert.equal(properties4.metadata!["baz"], "3");
  });
});
