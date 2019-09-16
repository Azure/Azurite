import * as assert from "assert";

import {
  Aborter,
  AccountSASPermissions,
  AccountSASResourceTypes,
  AccountSASServices,
  AnonymousCredential,
  BlobSASPermissions,
  BlockBlobURL,
  ContainerSASPermissions,
  ContainerURL,
  generateAccountSASQueryParameters,
  generateBlobSASQueryParameters,
  PageBlobURL,
  SASProtocol,
  ServiceURL,
  SharedKeyCredential,
  StorageURL
} from "@azure/storage-blob";

import { configLogger } from "../../src/common/Logger";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  TestServerFactory
} from "../testutils";

configLogger(false);

describe("Shared Access Signature (SAS) authentication", () => {
  const host = "127.0.0.1";
  const port = 11000;
  // TODO: Create a server factory as tests utils
  const server = TestServerFactory.getServer(host, port);

  // TODO: Create serviceURL factory as tests utils
  const baseURL = `http://${host}:${port}/devstoreaccount1`;
  const serviceURL = new ServiceURL(
    baseURL,
    StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    )
  );

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await TestServerFactory.rmTestFile();
  });

  it("generateAccountSASQueryParameters should work", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlacup").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        resourceTypes: AccountSASResourceTypes.parse("sco").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        startTime: now,
        version: "2016-05-31"
      },
      sharedKeyCredential as SharedKeyCredential
    ).toString();

    const sasURL = `${serviceURL.url}?${sas}`;
    const serviceURLWithSAS = new ServiceURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    await serviceURLWithSAS.getAccountInfo(Aborter.none);
  });

  it("generateAccountSASQueryParameters should not work with invalid permission", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiryTime: tmr,
        permissions: AccountSASPermissions.parse("wdlcup").toString(),
        resourceTypes: AccountSASResourceTypes.parse("sco").toString(),
        services: AccountSASServices.parse("btqf").toString()
      },
      sharedKeyCredential as SharedKeyCredential
    ).toString();

    const sasURL = `${serviceURL.url}?${sas}`;
    const serviceURLWithSAS = new ServiceURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    let error;
    try {
      await serviceURLWithSAS.getProperties(Aborter.none);
    } catch (err) {
      error = err;
    }

    assert.ok(error);
  });

  it("generateAccountSASQueryParameters should not work with invalid service", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiryTime: tmr,
        permissions: AccountSASPermissions.parse("rwdlacup").toString(),
        resourceTypes: AccountSASResourceTypes.parse("sco").toString(),
        services: AccountSASServices.parse("tqf").toString()
      },
      sharedKeyCredential as SharedKeyCredential
    ).toString();

    const sasURL = `${serviceURL.url}?${sas}`;
    const serviceURLWithSAS = new ServiceURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    let error;
    try {
      await serviceURLWithSAS.getProperties(Aborter.none);
    } catch (err) {
      error = err;
    }

    assert.ok(error);
  });

  it("generateAccountSASQueryParameters should not work with invalid resource type", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlacup").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2016-05-31"
      },
      sharedKeyCredential as SharedKeyCredential
    ).toString();

    const sasURL = `${serviceURL.url}?${sas}`;
    const serviceURLWithSAS = new ServiceURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    let error;
    try {
      await serviceURLWithSAS.getProperties(Aborter.none);
    } catch (err) {
      error = err;
    }

    assert.ok(error);
  });

  it("Copy blob should work with write permission in account SAS to override an existing blob", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlacup").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2016-05-31"
      },
      sharedKeyCredential as SharedKeyCredential
    ).toString();

    const sasURL = `${serviceURL.url}?${sas}`;
    const serviceURLWithSAS = new ServiceURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    const containerName = getUniqueName("con");
    const containerURL = ContainerURL.fromServiceURL(
      serviceURLWithSAS,
      containerName
    );
    await containerURL.create(Aborter.none);

    const blobName1 = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const blob1 = BlockBlobURL.fromContainerURL(containerURL, blobName1);
    const blob2 = BlockBlobURL.fromContainerURL(containerURL, blobName2);

    await blob1.upload(Aborter.none, "hello", 5);
    await blob2.startCopyFromURL(Aborter.none, blob1.url);

    // this copy should not throw any errors
    await blob2.startCopyFromURL(Aborter.none, blob1.url);
  });

  it("Copy blob shouldn't work without write permission in account SAS to override an existing blob", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rdlacup").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2016-05-31"
      },
      sharedKeyCredential as SharedKeyCredential
    ).toString();

    const sasURL = `${serviceURL.url}?${sas}`;
    const serviceURLWithSAS = new ServiceURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    const containerName = getUniqueName("con");
    const containerURL = ContainerURL.fromServiceURL(
      serviceURLWithSAS,
      containerName
    );
    await containerURL.create(Aborter.none);

    const blobName1 = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const blob1 = BlockBlobURL.fromContainerURL(containerURL, blobName1);
    const blob2 = BlockBlobURL.fromContainerURL(containerURL, blobName2);

    await blob1.upload(Aborter.none, "hello", 5);
    await blob2.startCopyFromURL(Aborter.none, blob1.url);

    // this copy should throw 403 error
    let error;
    try {
      await blob2.startCopyFromURL(Aborter.none, blob1.url);
    } catch (err) {
      error = err;
    }
    assert.deepEqual(error.statusCode, 403);
    assert.ok(error !== undefined);
  });

  it("Copy blob should work without write permission in account SAS to an nonexisting blob", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("c").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2016-05-31"
      },
      sharedKeyCredential as SharedKeyCredential
    ).toString();

    const sasURL = `${serviceURL.url}?${sas}`;
    const serviceURLWithSAS = new ServiceURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    const containerName = getUniqueName("con");
    const containerURL = ContainerURL.fromServiceURL(
      serviceURLWithSAS,
      containerName
    );
    await containerURL.create(Aborter.none);

    const blobName1 = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const blob1 = BlockBlobURL.fromContainerURL(containerURL, blobName1);
    const blob2 = BlockBlobURL.fromContainerURL(containerURL, blobName2);

    await blob1.upload(Aborter.none, "hello", 5);

    // this copy should work
    await blob2.startCopyFromURL(Aborter.none, blob1.url);
  });

  it("generateBlobSASQueryParameters should work for container", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container");
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);
    await containerURL.create(Aborter.none);

    const containerSAS = generateBlobSASQueryParameters(
      {
        containerName,
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: ContainerSASPermissions.parse("racwdl").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        startTime: now,
        version: "2016-05-31"
      },
      sharedKeyCredential as SharedKeyCredential
    );

    const sasURL = `${containerURL.url}?${containerSAS}`;
    const containerURLwithSAS = new ContainerURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    await containerURLwithSAS.listBlobFlatSegment(Aborter.none);
    await containerURL.delete(Aborter.none);
  });

  it("generateBlobSASQueryParameters should work for blob", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container");
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);
    await containerURL.create(Aborter.none);

    const blobName = getUniqueName("blob");
    const blobURL = PageBlobURL.fromContainerURL(containerURL, blobName);
    await blobURL.create(Aborter.none, 1024, {
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
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: BlobSASPermissions.parse("racwd").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        startTime: now,
        version: "2016-05-31"
      },
      sharedKeyCredential as SharedKeyCredential
    );

    const sasURL = `${blobURL.url}?${blobSAS}`;
    const blobURLwithSAS = new PageBlobURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    await blobURLwithSAS.getProperties(Aborter.none);

    // TODO:
    // const properties = await blobURLwithSAS.getProperties(Aborter.none);
    // assert.equal(properties.cacheControl, "cache-control-override");
    // assert.equal(properties.contentDisposition, "content-disposition-override");
    // assert.equal(properties.contentEncoding, "content-encoding-override");
    // assert.equal(properties.contentLanguage, "content-language-override");
    // assert.equal(properties.contentType, "content-type-override");

    await containerURL.delete(Aborter.none);
  });

  it("generateBlobSASQueryParameters should work for blob with special naming", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container-with-dash");
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);
    await containerURL.create(Aborter.none);

    const blobName = getUniqueName(
      // tslint:disable-next-line:max-line-length
      "////Upper/blob/empty /another 汉字 ру́сский язы́к ру́сский язы́к عربي/عربى にっぽんご/にほんご . special ~!@#$%^&*()_+`1234567890-={}|[]\\:\";'<>?,/'"
    );
    const blobURL = PageBlobURL.fromContainerURL(containerURL, blobName);
    await blobURL.create(Aborter.none, 1024, {
      blobHTTPHeaders: {
        blobContentType: "content-type-original"
      }
    });

    const blobSAS = generateBlobSASQueryParameters(
      {
        // NOTICE: Azure Storage Server will replace "\" with "/" in the blob names
        blobName: blobName.replace(/\\/g, "/"),
        cacheControl: "cache-control-override",
        containerName,
        contentDisposition: "content-disposition-override",
        contentEncoding: "content-encoding-override",
        contentLanguage: "content-language-override",
        contentType: "content-type-override",
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: BlobSASPermissions.parse("racwd").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        startTime: now,
        version: "2016-05-31"
      },
      sharedKeyCredential as SharedKeyCredential
    );

    const sasURL = `${blobURL.url}?${blobSAS}`;
    const blobURLwithSAS = new PageBlobURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    await blobURLwithSAS.getProperties(Aborter.none);

    // TODO:
    // const properties = await blobURLwithSAS.getProperties(Aborter.none);
    // assert.equal(properties.cacheControl, "cache-control-override");
    // assert.equal(properties.contentDisposition, "content-disposition-override");
    // assert.equal(properties.contentEncoding, "content-encoding-override");
    // assert.equal(properties.contentLanguage, "content-language-override");
    // assert.equal(properties.contentType, "content-type-override");

    await containerURL.delete(Aborter.none);
  });

  it("generateBlobSASQueryParameters should work for blob with access policy", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container");
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);
    await containerURL.create(Aborter.none);

    const blobName = getUniqueName("blob");
    const blobURL = PageBlobURL.fromContainerURL(containerURL, blobName);
    await blobURL.create(Aborter.none, 1024);

    const id = "unique-id";
    await containerURL.setAccessPolicy(Aborter.none, undefined, [
      {
        accessPolicy: {
          expiry: tmr,
          permission: ContainerSASPermissions.parse("racwdl").toString(),
          start: now
        },
        id
      }
    ]);

    const blobSAS = generateBlobSASQueryParameters(
      {
        containerName,
        identifier: id
      },
      sharedKeyCredential as SharedKeyCredential
    );

    const sasURL = `${blobURL.url}?${blobSAS}`;
    const blobURLwithSAS = new PageBlobURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    await blobURLwithSAS.getProperties(Aborter.none);
    await containerURL.delete(Aborter.none);
  });

  it("Copy blob should work with write permission in blob SAS to override an existing blob", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container");
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);
    await containerURL.create(Aborter.none);

    const containerSAS = generateBlobSASQueryParameters(
      {
        containerName,
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: ContainerSASPermissions.parse("w").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        startTime: now,
        version: "2016-05-31"
      },
      sharedKeyCredential as SharedKeyCredential
    );

    const sasURL = `${containerURL.url}?${containerSAS}`;
    const containerURLwithSAS = new ContainerURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    const blobName1 = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const blob1 = BlockBlobURL.fromContainerURL(containerURL, blobName1);
    const blob2 = BlockBlobURL.fromContainerURL(containerURL, blobName2);
    const blob2SAS = BlockBlobURL.fromContainerURL(
      containerURLwithSAS,
      blobName2
    );

    await blob1.upload(Aborter.none, "hello", 5);
    await blob2.upload(Aborter.none, "world", 5);

    // this copy should not throw any errors
    await blob2SAS.startCopyFromURL(Aborter.none, blob1.url);
  });

  it("Copy blob shouldn't work without write permission in blob SAS to override an existing blob", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container");
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);
    await containerURL.create(Aborter.none);

    const containerSAS = generateBlobSASQueryParameters(
      {
        containerName,
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: ContainerSASPermissions.parse("c").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        startTime: now,
        version: "2016-05-31"
      },
      sharedKeyCredential as SharedKeyCredential
    );

    const sasURL = `${containerURL.url}?${containerSAS}`;
    const containerURLwithSAS = new ContainerURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    const blobName1 = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const blob1 = BlockBlobURL.fromContainerURL(containerURL, blobName1);
    const blob2 = BlockBlobURL.fromContainerURL(containerURL, blobName2);
    const blob2SAS = BlockBlobURL.fromContainerURL(
      containerURLwithSAS,
      blobName2
    );

    await blob1.upload(Aborter.none, "hello", 5);
    await blob2.upload(Aborter.none, "world", 5);

    // this copy should throw 403 error
    let error;
    try {
      await blob2SAS.startCopyFromURL(Aborter.none, blob1.url);
    } catch (err) {
      error = err;
    }
    assert.deepEqual(error.statusCode, 403);
    assert.ok(error !== undefined);
  });

  it("Copy blob should work without write permission in account SAS to an nonexisting blob", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container");
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);
    await containerURL.create(Aborter.none);

    const containerSAS = generateBlobSASQueryParameters(
      {
        containerName,
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: ContainerSASPermissions.parse("c").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        startTime: now,
        version: "2016-05-31"
      },
      sharedKeyCredential as SharedKeyCredential
    );

    const sasURL = `${containerURL.url}?${containerSAS}`;
    const containerURLwithSAS = new ContainerURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    const blobName1 = getUniqueName("blob");
    const blobName2 = getUniqueName("blob");
    const blob1 = BlockBlobURL.fromContainerURL(containerURL, blobName1);
    const blob2SAS = BlockBlobURL.fromContainerURL(
      containerURLwithSAS,
      blobName2
    );

    await blob1.upload(Aborter.none, "hello", 5);

    // this copy should work
    await blob2SAS.startCopyFromURL(Aborter.none, blob1.url);
  });

  it("GenerateUserDelegationSAS should work for blob snapshot", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const containerName = getUniqueName("container");
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);
    await containerURL.create(Aborter.none);

    const blobName = getUniqueName("blob");
    const blobURL = PageBlobURL.fromContainerURL(containerURL, blobName);
    await blobURL.create(Aborter.none, 1024, {
      blobHTTPHeaders: {
        blobContentType: "content-type-original"
      }
    });
    const response = await blobURL.createSnapshot(Aborter.none);

    const blobSAS = generateBlobSASQueryParameters(
      {
        blobName,
        cacheControl: "cache-control-override",
        containerName,
        contentDisposition: "content-disposition-override",
        contentEncoding: "content-encoding-override",
        contentLanguage: "content-language-override",
        contentType: "content-type-override",
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: BlobSASPermissions.parse("racwd").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        startTime: now,
        snapshotTime: response.snapshot
      },
      sharedKeyCredential as SharedKeyCredential
    );

    const sasURL = `${blobURL.withSnapshot(response.snapshot!).url}&${blobSAS}`;
    const blobURLwithSAS = new PageBlobURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    const properties = await blobURLwithSAS.getProperties(Aborter.none);
    assert.ok(properties);
    // assert.equal(properties.cacheControl, "cache-control-override");
    // assert.equal(properties.contentDisposition, "content-disposition-override");
    // assert.equal(properties.contentEncoding, "content-encoding-override");
    // assert.equal(properties.contentLanguage, "content-language-override");
    // assert.equal(properties.contentType, "content-type-override");

    await containerURL.delete(Aborter.none);
  });
});
