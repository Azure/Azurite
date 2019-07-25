import * as assert from "assert";

import { PublicAccessType } from "../../../src/blob/generated/artifacts/models";
import { ServicePropertiesModel } from "../../../src/blob/persistence/IBlobDataStore";
import IBlobMetadataStore, {
  ContainerModel
} from "../../../src/blob/persistence/IBlobMetadataStore";
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
      logging: false,
      pool: {
        max: 100,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      dialectOptions: {
        timezone: "Etc/GMT-0"
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

    await store.setServiceProperties(serviceProperties);
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

    await store.setServiceProperties(serviceProperties);
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
    await store.setServiceProperties(updateServiceProperties);
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

    await store.setServiceProperties(serviceProperties);
    let res = await store.getServiceProperties(accountName);
    assert.deepStrictEqual(serviceProperties, res);

    const updateServiceProperties: ServicePropertiesModel = {
      accountName,
      cors: []
    };
    await store.setServiceProperties(updateServiceProperties);
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

    const res = await store.getContainerProperties(
      container.accountName,
      container.name
    );
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
    const res = await store.getContainerProperties(
      container.accountName,
      container.name
    );
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

    const res = await store.getContainerProperties(
      container.accountName,
      container.name
    );
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

    const res = await store.getContainerProperties(
      container.accountName,
      container.name
    );
    assert.notDeepStrictEqual(res, undefined);
    assert.deepStrictEqual(res!.metadata, container.metadata);
  });

  it("Create and get large amount of containers", async () => {
    const count = 1000;
    const timestamp = new Date().getTime();
    const createOperations: Promise<any>[] = [];
    const containers: ContainerModel[] = [];
    for (let i = 0; i < count; i++) {
      const container = {
        accountName: `accountname_${timestamp}_${i}`,
        name: `containername_${timestamp}_${i}`,
        properties: {
          lastModified: new Date(),
          etag: "etag",
          publicAccess: PublicAccessType.Container,
          hasImmutabilityPolicy: true,
          hasLegalHold: false
        }
      };
      containers.push(container);
      createOperations.push(store.createContainer(container));
    }

    // let time = new Date();
    await Promise.all(createOperations);
    // let now = new Date();
    // console.log(now.getTime() - time.getTime());

    const readContainerOperations: Promise<any>[] = [];
    for (let i = 0; i < count; i++) {
      readContainerOperations.push(
        store.getContainerProperties(
          `accountname_${timestamp}_${i}`,
          `containername_${timestamp}_${i}`
        )
      );
    }

    // time = new Date();
    const res = await Promise.all(readContainerOperations);
    for (let i = 0; i < count; i++) {
      assert.deepStrictEqual(containers[i], res[i]);
    }
    // now = new Date();
    // console.log(now.getTime() - time.getTime());
  });

  it("listContainers should work", async () => {
    const count = 20;
    const timestamp = new Date().getTime();
    const createOperations: Promise<any>[] = [];
    const containers: ContainerModel[] = [];
    const accountName = `accountname_${timestamp}`;
    const containerAcl = [
      {
        accessPolicy: {
          expiry: "2018-11-31T11:22:33.4567890Z",
          permission: "rwd",
          start: "2017-12-31T11:22:33.4567890Z"
        },
        id: "MTIzNDU2Nd5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="
      }
    ];
    const metadata = {
      meta1: "value1",
      META2: "META2"
    };
    for (let i = 0; i < count; i++) {
      const container: ContainerModel = {
        accountName,
        name: `containername_${timestamp}_${i}`,
        containerAcl,
        metadata,
        properties: {
          lastModified: new Date(),
          etag: "etag",
          publicAccess: PublicAccessType.Container,
          hasImmutabilityPolicy: true,
          hasLegalHold: false
        }
      };
      containers.push(container);
      createOperations.push(store.createContainer(container));
    }

    await Promise.all(createOperations);

    const [result] = await store.listContainers(accountName);
    for (const container of result) {
      assert.deepStrictEqual(container.accountName, accountName);
      assert.deepStrictEqual(container.properties.etag, "etag");
      assert.deepStrictEqual(
        container.properties.publicAccess,
        PublicAccessType.Container
      );
      assert.deepStrictEqual(container.properties.hasImmutabilityPolicy, true);
      assert.deepStrictEqual(container.properties.hasLegalHold, false);
      assert.deepStrictEqual(container.metadata, metadata);
      assert.deepStrictEqual(container.containerAcl, containerAcl);
    }
  });

  it("listContainers should work for prefix", async () => {
    const count = 20;
    const timestamp = new Date().getTime();
    const createOperations: Promise<any>[] = [];
    const containers: ContainerModel[] = [];
    const accountName = `accountname_${timestamp}`;
    const containerAcl = [
      {
        accessPolicy: {
          expiry: "2018-11-31T11:22:33.4567890Z",
          permission: "rwd",
          start: "2017-12-31T11:22:33.4567890Z"
        },
        id: "MTIzNDU2Nd5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="
      }
    ];
    const metadata = {
      meta1: "value1",
      META2: "META2"
    };
    for (let i = 0; i < count; i++) {
      const container: ContainerModel = {
        accountName,
        name: `containername_${timestamp}_${i}`,
        containerAcl,
        metadata,
        properties: {
          lastModified: new Date(),
          etag: "etag",
          publicAccess: PublicAccessType.Container,
          hasImmutabilityPolicy: true,
          hasLegalHold: false
        }
      };
      containers.push(container);
      createOperations.push(store.createContainer(container));
    }

    await Promise.all(createOperations);

    let [result] = await store.listContainers(accountName, "containername");
    assert.deepStrictEqual(result.length, count);
    for (const container of result) {
      assert.deepStrictEqual(container.accountName, accountName);
      assert.deepStrictEqual(container.properties.etag, "etag");
      assert.deepStrictEqual(
        container.properties.publicAccess,
        PublicAccessType.Container
      );
      assert.deepStrictEqual(container.properties.hasImmutabilityPolicy, true);
      assert.deepStrictEqual(container.properties.hasLegalHold, false);
      assert.deepStrictEqual(container.metadata, metadata);
      assert.deepStrictEqual(container.containerAcl, containerAcl);
    }

    [result] = await store.listContainers(
      accountName,
      `invalidna${new Date().getTime()}`
    );
    assert.deepStrictEqual(result.length, 0);
  });

  it("listContainers should work for segment listing", async () => {
    const count = 10;
    const timestamp = new Date().getTime();
    const createOperations: Promise<any>[] = [];
    const containers: ContainerModel[] = [];
    const accountName = `accountname_${timestamp}`;
    const prefix = `prefix_${timestamp}`;
    const containerAcl = [
      {
        accessPolicy: {
          expiry: "2018-11-31T11:22:33.4567890Z",
          permission: "rwd",
          start: "2017-12-31T11:22:33.4567890Z"
        },
        id: "MTIzNDU2Nd5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="
      }
    ];
    const metadata = {
      meta1: "value1",
      META2: "META2"
    };
    for (let i = 0; i < count; i++) {
      const container: ContainerModel = {
        accountName,
        name: `${prefix}_containername_${timestamp}_${i}`,
        containerAcl,
        metadata,
        properties: {
          lastModified: new Date(),
          etag: "etag",
          publicAccess: PublicAccessType.Container,
          hasImmutabilityPolicy: true,
          hasLegalHold: false
        }
      };
      containers.push(container);
      createOperations.push(store.createContainer(container));
    }

    await Promise.all(createOperations);

    let [result, marker] = await store.listContainers(
      accountName,
      `${prefix}_containername`,
      5
    );
    assert.deepStrictEqual(result.length, 5);
    assert.notDeepStrictEqual(marker, undefined);

    [result, marker] = await store.listContainers(
      accountName,
      `${prefix}_containername`,
      5,
      marker
    );
    assert.deepStrictEqual(result.length, 5);
    assert.notDeepStrictEqual(marker, undefined);

    [result, marker] = await store.listContainers(
      accountName,
      `${prefix}_containername`,
      5,
      marker
    );
    assert.deepStrictEqual(result.length, 0);
    assert.deepStrictEqual(marker, undefined);
  });
});
