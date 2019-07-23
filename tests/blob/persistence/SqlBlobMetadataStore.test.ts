import * as assert from "assert";

import { PublicAccessType } from "../../../src/blob/generated/artifacts/models";
import { ServicePropertiesModel } from "../../../src/blob/persistence/IBlobDataStore";
import IBlobMetadataStore, { ContainerModel } from "../../../src/blob/persistence/IBlobMetadataStore";
import SqlBlobMetadataStore from "../../../src/blob/persistence/SqlBlobMetadataStore";

// TODO: Collect database URI from environment variable. If not, skip these cases
// TODO: Make sure DB has been initialized with required tables and rows. Make it automatically in the future
// Make sure DB has been booted
const DB_URI =
  "mariadb://root:my-secret-pw@127.0.0.1:3306/azurite_blob_metadata";

// TODO: Make test cases shared cross all IBlobMetadataStore implementations
let store: IBlobMetadataStore;

describe("SqlBlobMetadataStore", () => {
  before(async () => {
    store = new SqlBlobMetadataStore(DB_URI, {
      pool: {
        max: 30,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    });
    await store.init();
  });

  after(async () => {
    await store.close();
  });

  it("Get ServiceProperties should return undefined for a not existing storage account", async () => {
    // const serviceProperties = {
    //   cors: [],
    //   defaultServiceVersion: "2018-03-28",
    //   hourMetrics: {
    //     enabled: false,
    //     retentionPolicy: {
    //       enabled: false
    //     },
    //     version: "1.0"
    //   },
    //   logging: {
    //     deleteProperty: true,
    //     read: true,
    //     retentionPolicy: {
    //       enabled: false
    //     },
    //     version: "1.0",
    //     write: true
    //   },
    //   minuteMetrics: {
    //     enabled: false,
    //     retentionPolicy: {
    //       enabled: false
    //     },
    //     version: "1.0"
    //   },
    //   staticWebsite: {
    //     enabled: false
    //   }
    // };

    const accountName = `accountname_${new Date().getTime()}`;
    let res = await store.getServiceProperties(accountName);
    assert.deepStrictEqual(res, undefined);
  });

  it("Get/Set ServiceProperties should work ", async () => {
    const accountName = `accountname_${new Date().getTime()}`;

    const serviceProperties = {
      accountName,
      cors: [],
      defaultServiceVersion: "2018-03-28",
      hourMetrics: {
        enabled: false,
        retentionPolicy: {
          enabled: false
        },
        version: "1.0"
      },
      logging: {
        deleteProperty: true,
        read: true,
        retentionPolicy: {
          enabled: false
        },
        version: "1.0",
        write: true
      },
      minuteMetrics: {
        enabled: false,
        retentionPolicy: {
          enabled: false
        },
        version: "1.0"
      },
      staticWebsite: {
        enabled: false
      }
    };

    await store.updateServiceProperties(serviceProperties);
    const res = await store.getServiceProperties(accountName);
    assert.deepStrictEqual(serviceProperties, res);
  });

  it("Set ServiceProperties should update cors separately", async () => {
    const accountName = `accountname_${new Date().getTime()}`;

    const serviceProperties = {
      accountName,
      cors: [],
      defaultServiceVersion: "2018-03-28",
      hourMetrics: {
        enabled: false,
        retentionPolicy: {
          enabled: false
        },
        version: "1.0"
      },
      logging: {
        deleteProperty: true,
        read: true,
        retentionPolicy: {
          enabled: false
        },
        version: "1.0",
        write: true
      },
      minuteMetrics: {
        enabled: false,
        retentionPolicy: {
          enabled: false
        },
        version: "1.0"
      },
      staticWebsite: {
        enabled: false
      }
    };

    await store.updateServiceProperties(serviceProperties);
    let res = await store.getServiceProperties(accountName);
    assert.deepStrictEqual(serviceProperties, res);

    const updateServiceProperties: ServicePropertiesModel = {
      accountName,
      cors: [
        {
          allowedHeaders: "*",
          allowedMethods: "GET",
          allowedOrigins: "example.com",
          exposedHeaders: "*",
          maxAgeInSeconds: 8888
        }
      ]
    };
    await store.updateServiceProperties(updateServiceProperties);
    res = await store.getServiceProperties(accountName);
    assert.deepStrictEqual(
      { ...serviceProperties, cors: updateServiceProperties.cors },
      res
    );
  });

  it("Set ServiceProperties should clear cors", async () => {
    const accountName = `accountname_${new Date().getTime()}`;

    const serviceProperties = {
      accountName,
      cors: [
        {
          allowedHeaders: "*",
          allowedMethods: "GET",
          allowedOrigins: "example.com",
          exposedHeaders: "*",
          maxAgeInSeconds: 8888
        }
      ],
      defaultServiceVersion: "2018-03-28",
      hourMetrics: {
        enabled: false,
        retentionPolicy: {
          enabled: false
        },
        version: "1.0"
      },
      logging: {
        deleteProperty: true,
        read: true,
        retentionPolicy: {
          enabled: false
        },
        version: "1.0",
        write: true
      },
      minuteMetrics: {
        enabled: false,
        retentionPolicy: {
          enabled: false
        },
        version: "1.0"
      },
      staticWebsite: {
        enabled: false
      }
    };

    await store.updateServiceProperties(serviceProperties);
    let res = await store.getServiceProperties(accountName);
    assert.deepStrictEqual(serviceProperties, res);

    const updateServiceProperties: ServicePropertiesModel = {
      accountName,
      cors: []
    };
    await store.updateServiceProperties(updateServiceProperties);
    res = await store.getServiceProperties(accountName);
    assert.deepStrictEqual(
      { ...serviceProperties, cors: updateServiceProperties.cors },
      res
    );
  });

  it("createContainer should work", async () => {
    const accountName = `accountname_${new Date().getTime()}`;
    const containerName = `containerName_${new Date().getTime()}`;

    const container: ContainerModel = {
      accountName,
      name: containerName,
      containerAcl: [
        {
          accessPolicy: {
            expiry: "2018-12-31T11:22:33.4567890Z",
            permission: "rwd",
            start: "2017-12-31T11:22:33.4567890Z"
          },
          id: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="
        }
      ],
      metadata: {
        meta1: "value1",
        META2: "META2"
      },
      properties: {
        lastModified: new Date(),
        etag: "etag",
        publicAccess: PublicAccessType.Container,
        hasImmutabilityPolicy: true,
        hasLegalHold: false
      }
    };
    await store.createContainer(container);

    const res = await store.getContainer(container.accountName, container.name);
    assert.deepStrictEqual(res, container);
  });

  it("createContainer should throw container exist error", async () => {
    const accountName = `accountname_${new Date().getTime()}`;
    const containerName = `containerName_${new Date().getTime()}`;

    const container: ContainerModel = {
      accountName,
      name: containerName,
      containerAcl: [
        {
          accessPolicy: {
            expiry: "2018-12-31T11:22:33.4567890Z",
            permission: "rwd",
            start: "2017-12-31T11:22:33.4567890Z"
          },
          id: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="
        }
      ],
      metadata: {
        meta1: "value1",
        META2: "META2"
      },
      properties: {
        lastModified: new Date(),
        etag: "etag",
        publicAccess: PublicAccessType.Container,
        hasImmutabilityPolicy: true,
        hasLegalHold: false
      }
    };
    await store.createContainer(container);

    let expectedError = false;
    try {
      await store.createContainer(container);
    } catch (err) {
      expectedError = true;
      assert.deepStrictEqual(err.statusMessage, "ContainerAlreadyExists");
    }
    assert.deepStrictEqual(expectedError, true);
  });

  it("deleteContainer should work", async () => {
    const accountName = `accountname_${new Date().getTime()}`;
    const containerName = `containerName_${new Date().getTime()}`;

    const container: ContainerModel = {
      accountName,
      name: containerName,
      containerAcl: [
        {
          accessPolicy: {
            expiry: "2018-12-31T11:22:33.4567890Z",
            permission: "rwd",
            start: "2017-12-31T11:22:33.4567890Z"
          },
          id: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="
        }
      ],
      metadata: {
        meta1: "value1",
        META2: "META2"
      },
      properties: {
        lastModified: new Date(),
        etag: "etag",
        publicAccess: PublicAccessType.Container,
        hasImmutabilityPolicy: true,
        hasLegalHold: false
      }
    };
    await store.createContainer(container);
    await store.deleteContainer(container.accountName, container.name);
    const res = await store.getContainer(container.accountName, container.name);
    assert.deepStrictEqual(res, undefined);
  });

  it("deleteContainer should NOT throw container not exist error", async () => {
    await store.deleteContainer("unexistaccount", "unexistcontainer");
  });

  it("setContainerMetadata should work", async () => {
    const accountName = `accountname_${new Date().getTime()}`;
    const containerName = `containerName_${new Date().getTime()}`;

    let container: ContainerModel = {
      accountName,
      name: containerName,
      containerAcl: [
        {
          accessPolicy: {
            expiry: "2018-12-31T11:22:33.4567890Z",
            permission: "rwd",
            start: "2017-12-31T11:22:33.4567890Z"
          },
          id: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="
        }
      ],
      metadata: {
        meta1: "value1",
        META2: "META2"
      },
      properties: {
        lastModified: new Date(),
        etag: "etag",
        publicAccess: PublicAccessType.Container,
        hasImmutabilityPolicy: true,
        hasLegalHold: false
      }
    };
    await store.createContainer(container);

    container = {
      accountName,
      name: containerName,
      metadata: {
        meta1: "value1new",
        META2: "META2new"
      },
      properties: {
        lastModified: new Date(),
        etag: "etag2"
      }
    };
    await store.setContainerMetadata(container);

    const res = await store.getContainer(container.accountName, container.name);
    assert.notDeepStrictEqual(res, undefined);
    assert.notDeepStrictEqual(res!.properties, undefined);
    assert.deepStrictEqual(res!.metadata, container.metadata);
    assert.deepStrictEqual(
      res!.properties.lastModified,
      container.properties.lastModified
    );
    assert.deepStrictEqual(res!.properties.etag, container.properties.etag);
  });

  it("setContainerMetadata should able to delete container metadata when passing undefined", async () => {
    const accountName = `accountname_${new Date().getTime()}`;
    const containerName = `containerName_${new Date().getTime()}`;

    let container: ContainerModel = {
      accountName,
      name: containerName,
      containerAcl: [
        {
          accessPolicy: {
            expiry: "2018-12-31T11:22:33.4567890Z",
            permission: "rwd",
            start: "2017-12-31T11:22:33.4567890Z"
          },
          id: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="
        }
      ],
      metadata: {
        meta1: "value1",
        META2: "META2"
      },
      properties: {
        lastModified: new Date(),
        etag: "etag",
        publicAccess: PublicAccessType.Container,
        hasImmutabilityPolicy: true,
        hasLegalHold: false
      }
    };
    await store.createContainer(container);

    container = {
      accountName,
      name: containerName,
      properties: {
        lastModified: new Date(),
        etag: "etag2"
      }
    };
    await store.setContainerMetadata(container);

    const res = await store.getContainer(container.accountName, container.name);
    assert.notDeepStrictEqual(res, undefined);
    assert.deepStrictEqual(res!.metadata, container.metadata);
  });
});
