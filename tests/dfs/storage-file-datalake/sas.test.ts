import * as assert from "assert";
import {
  AccountSASPermissions,
  AccountSASResourceTypes,
  AccountSASServices,
  AnonymousCredential,
  DataLakeFileClient,
  DataLakeFileSystemClient,
  DataLakeSASPermissions,
  DataLakeServiceClient,
  FileSystemSASPermissions,
  generateAccountSASQueryParameters,
  generateDataLakeSASQueryParameters,
  newPipeline,
  SASProtocol,
  StorageSharedKeyCredential
} from "@azure/storage-file-datalake";

import { configLogger } from "../../../src/common/Logger";
import {
  EMULATOR_ACCOUNT_KEY_STR,
  EMULATOR_ACCOUNT_NAME
} from "../../../src/dfs/utils/constants";
import { getUniqueName } from "../../testutils";
import DataLakeTestServerFactory from "../DataLakeTestServerFactory";

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
  const serviceClient = new DataLakeServiceClient(
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

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  it("generateAccountSASQueryParameters should work @loki @sql", async () => {
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
    const serviceClientWithSAS = new DataLakeServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential(), {
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    await serviceClientWithSAS.getProperties();
  });

  it("generateAccountSASQueryParameters should work for set blob tier @loki @sql", async () => {
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
    const serviceClientWithSAS = new DataLakeServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential(), {
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const containerClientWithSAS = serviceClientWithSAS.getFileSystemClient(
      getUniqueName("con")
    );
    await containerClientWithSAS.create();

    const blockBlobClientWithSAS = containerClientWithSAS.getFileClient(
      getUniqueName("blob")
    );
    await blockBlobClientWithSAS.upload(Buffer.from("abc"));

    //TODO: Revisit
    // await blockBlobClientWithSAS.setAccessTier("Hot");
  });

  it("generateAccountSASQueryParameters should not work with invalid permission @loki @sql", async () => {
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
    const serviceClientWithSAS = new DataLakeServiceClient(
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

  it("generateAccountSASQueryParameters should not work with invalid service @loki @sql", async () => {
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
    const serviceClientWithSAS = new DataLakeServiceClient(
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

  it("generateAccountSASQueryParameters should not work with invalid resource type @loki @sql", async () => {
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
    const serviceClientWithSAS = new DataLakeServiceClient(
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

  it("Upload/Create/Append should work with write permission in account SAS to override an existing blob", async () => {
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

    // const sasURL = `http://${productionStyleHostName}:${server.config.port}?${sas}`;
    const sasURL = `${serviceClient.url}/?${sas}`;
    const serviceClientWithSAS = new DataLakeServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential(), {
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const fileSystemName = getUniqueName("con");
    const containerClient =
      serviceClientWithSAS.getFileSystemClient(fileSystemName);
    await containerClient.create();

    const blobName1 = getUniqueName("blob");
    const blob1 = containerClient.getFileClient(blobName1);

    await blob1.upload(Buffer.from("hello"));
    const buffer = await blob1.readToBuffer();
    assert.deepStrictEqual(buffer, Buffer.from("hello"));
  });

  it("Upload/Create/Append shouldn't work without write permission in account SAS to override an existing blob @loki @sql", async () => {
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
    const serviceClientWithSAS = new DataLakeServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential(), {
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const fileSystemName = getUniqueName("con");
    const containerClient =
      serviceClientWithSAS.getFileSystemClient(fileSystemName);
    await containerClient.create();

    const blobName1 = getUniqueName("blob");
    const blob1 = containerClient.getFileClient(blobName1);

    // this copy should throw 403 error
    let error;
    try {
      await blob1.upload(Buffer.from("hello"));
    } catch (err) {
      error = err;
    }
    assert.deepEqual(error.statusCode, 403);
    assert.ok(error !== undefined);
  });

  it("Create blob should work without write permission in account SAS to an nonexisting blob @loki @sql", async () => {
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
    const serviceClientWithSAS = new DataLakeServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential(), {
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const fileSystemName = getUniqueName("con");
    const containerClient =
      serviceClientWithSAS.getFileSystemClient(fileSystemName);
    await containerClient.create();

    const blobName1 = getUniqueName("blob");
    const blob1 = containerClient.getFileClient(blobName1);
    await blob1.create();
  });

  it("Upload/Create/Append blob should work with write permission in account SAS to override an existing blob @loki @sql", async () => {
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
    const serviceClientWithSAS = new DataLakeServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential(), {
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const fileSystemName = getUniqueName("con");
    const containerClient =
      serviceClientWithSAS.getFileSystemClient(fileSystemName);
    await containerClient.create();

    const blobName1 = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const blob1 = containerClient.getFileClient(blobName1);
    const blob2 = containerClient.getFileClient(blobName2);

    await blob1.upload(Buffer.from("hello"));
    // this copy should not throw any errors
    await blob2.create();
    await blob2.append("hello", 0, 5, { flush: true });
  });

  it("generateDataLakeSASQueryParameters should work for container @loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const fileSystemName = getUniqueName("container");
    const containerClient = serviceClient.getFileSystemClient(fileSystemName);
    await containerClient.create();

    const containerSAS = generateDataLakeSASQueryParameters(
      {
        fileSystemName,
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: FileSystemSASPermissions.parse("racwdl"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${containerClient.url}?${containerSAS}`;
    const containerClientWithSAS = new DataLakeFileSystemClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    await containerClientWithSAS.listPaths().byPage().next();
    await containerClient.delete();
  });

  it("generateDataLakeSASQueryParameters should work for append blob with original headers @loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const fileSystemName = getUniqueName("container");
    const containerClient = serviceClient.getFileSystemClient(fileSystemName);
    await containerClient.create();

    const blobName = getUniqueName("blob");
    const blobClient = containerClient.getFileClient(blobName);
    await blobClient.create({
      pathHttpHeaders: {
        cacheControl: "cache-control-original",
        contentType: "content-type-original",
        contentDisposition: "content-disposition-original",
        contentEncoding: "content-encoding-original",
        contentLanguage: "content-language-original"
      }
    });

    const blobSAS = generateDataLakeSASQueryParameters(
      {
        pathName: blobName,
        fileSystemName,
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: DataLakeSASPermissions.parse("racwd"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${blobClient.url}?${blobSAS}`;
    const blobClientWithSAS = new DataLakeFileClient(
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

    const downloadResponse = await blobClientWithSAS.read();
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

  it("generateDataLakeSASQueryParameters should work for append blob and override headers @loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const fileSystemName = getUniqueName("container");
    const containerClient = serviceClient.getFileSystemClient(fileSystemName);
    await containerClient.create();

    const blobName = getUniqueName("blob");
    const blobClient = containerClient.getFileClient(blobName);
    await blobClient.create({
      pathHttpHeaders: {
        contentType: "content-type-original"
      }
    });

    const blobSAS = generateDataLakeSASQueryParameters(
      {
        pathName: blobName,
        cacheControl: "cache-control-override",
        fileSystemName,
        contentDisposition: "content-disposition-override",
        contentEncoding: "content-encoding-override",
        contentLanguage: "content-language-override",
        contentType: "content-type-override",
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: DataLakeSASPermissions.parse("racwd"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${blobClient.url}?${blobSAS}`;
    const blobClientWithSAS = new DataLakeFileClient(
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

    const downloadResponse = await blobClientWithSAS.read();
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

  it("generateDataLakeSASQueryParameters should work for blob with special naming @loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const fileSystemName = getUniqueName("container-with-dash");
    const containerClient = serviceClient.getFileSystemClient(fileSystemName);
    await containerClient.create();

    const blobName = getUniqueName(
      // tslint:disable-next-line:max-line-length
      "////Upper/blob/empty /another 汉字 ру́сский язы́к ру́сский язы́к عربي/عربى にっぽんご/にほんご . special ~!@#$%^&*()_+`1234567890-={}|[]\\:\";'<>?,/'"
    );
    const blobClient = containerClient.getFileClient(blobName);
    await blobClient.create({
      pathHttpHeaders: {
        contentType: "content-type-original"
      }
    });

    const blobSAS = generateDataLakeSASQueryParameters(
      {
        // NOTICE: Azure Storage Server will replace "\" with "/" in the blob names
        pathName: blobName.replace(/\\/g, "/"),
        cacheControl: "cache-control-override",
        fileSystemName,
        contentDisposition: "content-disposition-override",
        contentEncoding: "content-encoding-override",
        contentLanguage: "content-language-override",
        contentType: "content-type-override",
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: DataLakeSASPermissions.parse("racwd"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${blobClient.url}?${blobSAS}`;
    const blobClientWithSAS = new DataLakeFileClient(
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

    const downloadResponse = await blobClientWithSAS.read();
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

  it("generateDataLakeSASQueryParameters should work for blob with access policy @loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const fileSystemName = getUniqueName("container");
    const containerClient = serviceClient.getFileSystemClient(fileSystemName);
    await containerClient.create();

    const blobName = getUniqueName("blob");
    const blobClient = containerClient.getFileClient(blobName);
    await blobClient.create();

    const id = "unique-id";
    const result = await containerClient.setAccessPolicy(undefined, [
      {
        accessPolicy: {
          expiresOn: tmr,
          permissions: FileSystemSASPermissions.parse("racwdl").toString(),
          startsOn: now
        },
        id
      }
    ]);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    const blobSAS = generateDataLakeSASQueryParameters(
      {
        fileSystemName,
        identifier: id
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${blobClient.url}?${blobSAS}`;
    const blobClientWithSAS = new DataLakeFileClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    await blobClientWithSAS.getProperties();
    await containerClient.delete();
  });

  it("Synchronized copy blob should work with write permission in blob SAS to override an existing blob @loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const fileSystemName = getUniqueName("container");
    const containerClient = serviceClient.getFileSystemClient(fileSystemName);
    await containerClient.create();

    const containerSAS = generateDataLakeSASQueryParameters(
      {
        fileSystemName,
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: FileSystemSASPermissions.parse("w"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${containerClient.url}?${containerSAS}`;
    const containerClientWithSAS = new DataLakeFileSystemClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    const blobName1 = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const blob1 = containerClient.getFileClient(blobName1);
    const blob2 = containerClient.getFileClient(blobName2);
    const blob1SAS = containerClientWithSAS.getFileClient(blobName1);

    await blob1.create();
    await blob2.create();

    await blob1SAS.create();
    await blob1SAS.append("hello", 0, 5, { flush: true });
  });

  it("Synchronized copy blob shouldn't work without write permission in blob SAS to override an existing blob @loki @sql", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const fileSystemName = getUniqueName("container");
    const containerClient = serviceClient.getFileSystemClient(fileSystemName);
    await containerClient.create();

    const containerSAS = generateDataLakeSASQueryParameters(
      {
        fileSystemName,
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: FileSystemSASPermissions.parse("c"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${containerClient.url}?${containerSAS}`;
    const containerClientWithSAS = new DataLakeFileSystemClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    const blobName1 = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const blob1 = containerClient.getFileClient(blobName1);
    const blob2 = containerClient.getFileClient(blobName2);
    const blob1SAS = containerClientWithSAS.getFileClient(blobName1);

    await blob1.upload(Buffer.from("hello"));
    await blob2.upload(Buffer.from("world"));

    // this copy should throw 403 error
    let error;
    try {
      await blob1SAS.create();
      await blob1SAS.append("hello", 0, 5, { flush: true });
    } catch (err) {
      error = err;
    }
    assert.deepEqual(error.statusCode, 403);
    assert.ok(error !== undefined);
  });
});
