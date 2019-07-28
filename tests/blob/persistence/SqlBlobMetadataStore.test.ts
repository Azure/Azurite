import * as assert from "assert";
import async from "async";
import { promisify } from "bluebird";
import uuid from "uuid/v4";

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

  it("Create 1000 account should work.", async () => {
    const accountName = `accountname_${new Date().getTime()}`;

    const count = 1000;
    const createOp: Promise<any>[] = [];
    for (let i = 0; i < count; i++) {
      const serviceProperties = {
        accountName: `${accountName}_${i}`,
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

      createOp.push(store.setServiceProperties(serviceProperties));
    }

    await Promise.all(createOp);
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

    let time = new Date();
    await Promise.all(createOperations);
    let now = new Date();
    console.log(now.getTime() - time.getTime());

    const readContainerOperations: Promise<any>[] = [];
    for (let i = 0; i < count; i++) {
      readContainerOperations.push(
        store.getContainerProperties(
          `accountname_${timestamp}_${i}`,
          `containername_${timestamp}_${i}`
        )
      );
    }

    time = new Date();
    const res = await Promise.all(readContainerOperations);
    for (let i = 0; i < count; i++) {
      assert.deepStrictEqual(containers[i], res[i]);
    }
    now = new Date();
    console.log(now.getTime() - time.getTime());
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

  it("stageBlock", async () => {
    const blobName = "blob2";
    const promises = [];

    for (let i = 0; i < 50000; i++) {
      promises.push(
        store.stageBlock({
          name: uuid(),
          size: 4 * 1024 * 1024,
          accountName: "account",
          containerName: "container",
          blobName,
          isCommitted: true,
          persistency: {
            id: `${i}_`,
            offset: 0,
            count: 4 * 1024 * 1024
          }
        })
      );
    }

    const start = new Date();
    await Promise.all(promises);
    const end = new Date();
    console.log(end.getTime() - start.getTime());
  });

  it("bulkInsertBlock within transaction", async () => {
    const blocks = [];
    const blocks2 = [];
    const blocks3 = [];
    const blocks4 = [];
    const blocks5 = [];
    const containers = [];

    const count = 10000;
    for (let i = 0; i <= count; i++) {
      blocks.push({
        name: uuid(),
        blobName: uuid(),
        size: 4 * 1024 * 1024,
        accountName: "account",
        containerName: "container",
        isCommitted: true,
        persistency: {
          id: `${i}_`,
          offset: 0,
          count: 4 * 1024 * 1024
        }
      });
      blocks2.push({
        name: uuid(),
        blobName: uuid(),
        size: 4 * 1024 * 1024,
        accountName: "account",
        containerName: "container",
        isCommitted: true,
        persistency: {
          id: `${i}_`,
          offset: 0,
          count: 4 * 1024 * 1024
        }
      });
      blocks3.push({
        name: uuid(),
        blobName: uuid(),
        size: 4 * 1024 * 1024,
        accountName: "account",
        containerName: "container",
        isCommitted: true,
        persistency: {
          id: `${i}_`,
          offset: 0,
          count: 4 * 1024 * 1024
        }
      });
      blocks4.push({
        name: uuid(),
        blobName: uuid(),
        size: 4 * 1024 * 1024,
        accountName: "account",
        containerName: "container",
        isCommitted: true,
        persistency: {
          id: `${i}_`,
          offset: 0,
          count: 4 * 1024 * 1024
        }
      });
      blocks5.push({
        name: uuid(),
        blobName: uuid(),
        size: 4 * 1024 * 1024,
        accountName: "account",
        containerName: "container",
        isCommitted: true,
        persistency: {
          id: `${i}_`,
          offset: 0,
          count: 4 * 1024 * 1024
        }
      });
    }

    for (let i = 0; i < count; i++) {
      const container: ContainerModel = {
        accountName: "account",
        name: `containername_${i}_${new Date().getTime()}`,
        properties: {
          lastModified: new Date(),
          etag: "etag",
          publicAccess: PublicAccessType.Container,
          hasImmutabilityPolicy: true,
          hasLegalHold: false
        }
      };
      containers.push(container);
    }

    // const mapLimitAsync = promisify(async.mapLimit);

    // concurrency 30
    // Bulk insert 1 rows, 32ms
    // Bulk insert 50 rows, 81ms
    // Bulk insert 100 rows, 213ms
    // Bulk insert 1000 rows, 1195ms
    // Bulk insert 10000 rows using 9388ms
    // Bulk insert 50000 rows using 47563ms

    // concurrency 100
    // Insert 10000 rows, using 9588ms
    const start = new Date();
    // const insertBlocks = mapLimitAsync(blocks, 100, async block => {
    //   await (store as any).insertBlock(block);
    // });

    // const insertContainers = mapLimitAsync(containers, 100, async container => {
    //   await store.createContainer(container);
    // });

    // await Promise.all([insertBlocks, insertContainers]);

    const pro1 = (store as any).bulkInsertBlockTran(blocks);
    // const pro2 = (store as any).bulkInsertBlock(blocks2);
    // const pro3 = (store as any).bulkInsertBlock(blocks3);
    // const pro4 = (store as any).bulkInsertBlock(blocks4);
    // const pro5 = (store as any).bulkInsertBlock(blocks5);
    await Promise.all([pro1]);

    // Single Table, 1000 rows single insert 1476ms
    // Two Table (block & container), 10000 * 2 rows single insert 28564ms

    // async.mapLimit(
    //   blocks,
    //   30,
    //   async block => {
    //     await (store as any).insertBlock(block);
    //   },
    //   () => {
    const end = new Date();
    console.log(end.getTime() - start.getTime());
    //     resolve();
    //   }
    // );

    // await Promise.all(promises);
  });

  it("bulkInsertBlock", async () => {
    const blocks = [];
    const blocks2 = [];
    const blocks3 = [];
    const blocks4 = [];
    const blocks5 = [];
    const containers = [];

    const count = 1;
    for (let i = 0; i <= count; i++) {
      blocks.push({
        name: uuid(),
        blobName: uuid(),
        size: 4 * 1024 * 1024,
        accountName: "account",
        containerName: "container",
        isCommitted: true,
        persistency: {
          id: `${i}_`,
          offset: 0,
          count: 4 * 1024 * 1024
        }
      });
      blocks2.push({
        name: uuid(),
        blobName: uuid(),
        size: 4 * 1024 * 1024,
        accountName: "account",
        containerName: "container",
        isCommitted: true,
        persistency: {
          id: `${i}_`,
          offset: 0,
          count: 4 * 1024 * 1024
        }
      });
      blocks3.push({
        name: uuid(),
        blobName: uuid(),
        size: 4 * 1024 * 1024,
        accountName: "account",
        containerName: "container",
        isCommitted: true,
        persistency: {
          id: `${i}_`,
          offset: 0,
          count: 4 * 1024 * 1024
        }
      });
      blocks4.push({
        name: uuid(),
        blobName: uuid(),
        size: 4 * 1024 * 1024,
        accountName: "account",
        containerName: "container",
        isCommitted: true,
        persistency: {
          id: `${i}_`,
          offset: 0,
          count: 4 * 1024 * 1024
        }
      });
      blocks5.push({
        name: uuid(),
        blobName: uuid(),
        size: 4 * 1024 * 1024,
        accountName: "account",
        containerName: "container",
        isCommitted: true,
        persistency: {
          id: `${i}_`,
          offset: 0,
          count: 4 * 1024 * 1024
        }
      });
    }

    for (let i = 0; i < count; i++) {
      const container: ContainerModel = {
        accountName: "account",
        name: `containername_${i}_${new Date().getTime()}`,
        properties: {
          lastModified: new Date(),
          etag: "etag",
          publicAccess: PublicAccessType.Container,
          hasImmutabilityPolicy: true,
          hasLegalHold: false
        }
      };
      containers.push(container);
    }

    // const mapLimitAsync = promisify(async.mapLimit);

    // Bulk insert 1 rows using 16ms, QPS Kps
    // Bulk insert 50 rows using 21ms, QPS 4Kps
    // Bulk insert 100 rows using 26ms, QPS 4Kps
    // Bulk insert 1000 rows using 98ms, QPS 10Kps
    // Bulk insert 1000 * 5 rows using 276ms, QPS 20Kps
    // Bulk insert 10000 rows using 582ms, 0.058 ms per second, QPS 20Kps
    // Bulk insert 50000 rows using 1944ms, QPS 25Kps
    const start = new Date();
    // const insertBlocks = mapLimitAsync(blocks, 100, async block => {
    //   await (store as any).insertBlock(block);
    // });

    // const insertContainers = mapLimitAsync(containers, 100, async container => {
    //   await store.createContainer(container);
    // });

    // await Promise.all([insertBlocks, insertContainers]);

    const pro1 = (store as any).bulkInsertBlock(blocks);
    // const pro2 = (store as any).bulkInsertBlock(blocks2);
    // const pro3 = (store as any).bulkInsertBlock(blocks3);
    // const pro4 = (store as any).bulkInsertBlock(blocks4);
    // const pro5 = (store as any).bulkInsertBlock(blocks5);
    await Promise.all([pro1]);

    // Single Table, 1000 rows single insert 1476ms
    // Two Table (block & container), 10000 * 2 rows single insert 28564ms

    // async.mapLimit(
    //   blocks,
    //   30,
    //   async block => {
    //     await (store as any).insertBlock(block);
    //   },
    //   () => {
    const end = new Date();
    console.log(end.getTime() - start.getTime());
    //     resolve();
    //   }
    // );

    // await Promise.all(promises);
  });

  it("insertBlocks", async () => {
    const blocks = [];
    const containers = [];

    const count = 10000;
    for (let i = 0; i <= count; i++) {
      blocks.push({
        name: uuid(),
        blobName: uuid(),
        size: 4 * 1024 * 1024,
        accountName: "account",
        containerName: "container",
        isCommitted: true,
        persistency: {
          id: `${i}_`,
          offset: 0,
          count: 4 * 1024 * 1024
        }
      });
    }

    for (let i = 0; i < count; i++) {
      const container: ContainerModel = {
        accountName: "account",
        name: `containername_${i}_${new Date().getTime()}`,
        properties: {
          lastModified: new Date(),
          etag: "etag",
          publicAccess: PublicAccessType.Container,
          hasImmutabilityPolicy: true,
          hasLegalHold: false
        }
      };
      containers.push(container);
    }

    const mapLimitAsync = promisify(async.mapLimit);

    const start = new Date();
    const insertBlocks = mapLimitAsync(blocks, 100, async block => {
      await (store as any).insertBlock(block);
    });

    // const insertContainers = mapLimitAsync(containers, 100, async container => {
    //   await store.createContainer(container);
    // });

    // await Promise.all([insertBlocks, insertContainers]);
    await Promise.all([insertBlocks]);

    // Single Table, 1 rows single insert 26ms
    // Single Table, 5 rows single insert 36ms
    // Single Table, 20 rows single insert 76ms
    // Single Table, 1000 rows single insert 1476ms
    // Single Table, 10000 rows single insert 13776ms
    // Two Table (block & container), 10000 * 2 rows single insert 28564ms

    // async.mapLimit(
    //   blocks,
    //   30,
    //   async block => {
    //     await (store as any).insertBlock(block);
    //   },
    //   () => {
    const end = new Date();
    console.log(end.getTime() - start.getTime());
    //     resolve();
    //   }
    // );

    // await Promise.all(promises);
  });

  it("updateBlock single row", async () => {
    const blocks = [];
    const updateBlocks = [];
    const containers = [];
    const updateContainers = [];

    const count = 50;
    for (let i = 0; i <= count; i++) {
      const name = uuid();
      const blobName = uuid();
      const block = {
        name,
        blobName,
        size: 4 * 1024 * 1024,
        accountName: "account",
        containerName: "container",
        isCommitted: true,
        persistency: {
          id: `${i}_`,
          offset: 0,
          count: 4 * 1024 * 1024
        }
      };
      blocks.push(block);
      updateBlocks.push({ ...block, name: block.name.repeat(2) });
    }

    for (let i = 0; i < count; i++) {
      const container: ContainerModel = {
        accountName: "account",
        name: `containername_${i}_${new Date().getTime()}`,
        properties: {
          lastModified: new Date(),
          etag: "etag",
          publicAccess: PublicAccessType.Container,
          hasImmutabilityPolicy: true,
          hasLegalHold: false
        }
      };
      containers.push(container);
      updateContainers.push({ ...container, metadata: { a: "123" } });
    }

    const mapLimitAsync = promisify(async.mapLimit);

    const insertBlocks = mapLimitAsync(blocks, 100, async block => {
      await (store as any).insertBlock(block);
    });
    const insertContainers = mapLimitAsync(containers, 100, async container => {
      await store.createContainer(container);
    });
    await Promise.all([insertBlocks, insertContainers]);

    // Update 1 block & 1 container parallel, 100 max concurrency, 24ms
    // Update different 10 block & different 10 container parallel, 100 max concurrency, 45ms
    // Update different 50 block & different 50 container parallel, 100 max concurrency, 183ms
    // Update different 100 block & different 100 container parallel, 100 max concurrency, 353ms
    // Update different 1000 block & different 1000 container parallel, 100 max concurrency, 2698ms
    // Update different 10000 block & different 10000 container parallel, 100 max concurrency, 29339ms

    // Update different 1 block, 100 max concurrency, 29ms
    // Update different 10 block, 100 max concurrency, 30ms
    // Update different 50 block, 100 max concurrency, 82ms
    // Update different 1000 block, 100 max concurrency, 175ms
    // Update different 1000 block, 100 max concurrency, 1444ms
    // Update different 10000 block, 100 max concurrency, 14102ms

    // No table isolation;
    // No update rows isolation;
    const start = new Date();
    const updateBlocksPro = mapLimitAsync(updateBlocks, 100, async block => {
      await (store as any).updateBlock(block);
    });
    // const updateContainersPro = mapLimitAsync(
    //   updateContainers,
    //   100,
    //   async container => {
    //     await store.setContainerMetadata(container);
    //   }
    // );
    await Promise.all([updateBlocksPro]);
    // await Promise.all([updateBlocksPro, updateContainersPro]);

    const end = new Date();
    console.log(end.getTime() - start.getTime());
  });

  it.only("updateBlock transaction", async () => {
    const blocks = [];
    const updateBlocks = [];
    const containers = [];
    const updateContainers = [];

    const count = 10000;
    for (let i = 0; i <= count; i++) {
      const name = uuid();
      const blobName = uuid();
      const block = {
        name,
        blobName,
        size: 4 * 1024 * 1024,
        accountName: "account",
        containerName: "container",
        isCommitted: true,
        persistency: {
          id: `${i}_`,
          offset: 0,
          count: 4 * 1024 * 1024
        }
      };
      blocks.push(block);
      updateBlocks.push({ ...block, name: block.name.repeat(2) });
    }

    for (let i = 0; i < count; i++) {
      const container: ContainerModel = {
        accountName: "account",
        name: `containername_${i}_${new Date().getTime()}`,
        properties: {
          lastModified: new Date(),
          etag: "etag",
          publicAccess: PublicAccessType.Container,
          hasImmutabilityPolicy: true,
          hasLegalHold: false
        }
      };
      containers.push(container);
      updateContainers.push({ ...container, metadata: { a: "123" } });
    }

    const mapLimitAsync = promisify(async.mapLimit);

    const insertBlocks = mapLimitAsync(blocks, 100, async block => {
      await (store as any).insertBlock(block);
    });
    const insertContainers = mapLimitAsync(containers, 100, async container => {
      await store.createContainer(container);
    });
    await Promise.all([insertBlocks, insertContainers]);

    // When using transaction, all updates are using same connection, no concurrency actually
    // Update 10000 rows in 1 transaction, 11112ms
    // Update 2 * 5000 rows in 2 concurrency transaction, 11021ms
    // Update 5 * 2000 rows in 5 concurrency transaction, 10875ms
    // Multi DB concurrency should improve the performance, however, node.js cpu is 100% when inserting the data.
    //
    const start = new Date();
    const updateBlocksPro = (store as any).updateBlocksTran(
      updateBlocks.slice(0, 2000)
    );
    const updateBlocksPro1 = (store as any).updateBlocksTran(
      updateBlocks.slice(2000, 4000)
    );
    const updateBlocksPro2 = (store as any).updateBlocksTran(
      updateBlocks.slice(4000, 6000)
    );
    const updateBlocksPro3 = (store as any).updateBlocksTran(
      updateBlocks.slice(6000, 8000)
    );
    const updateBlocksPro4 = (store as any).updateBlocksTran(
      updateBlocks.slice(8000, 10000)
    );
    // const updateBlocksPro2 = (store as any).updateBlocksTran(updateBlocks);
    // const updateContainersPro = mapLimitAsync(
    //   updateContainers,
    //   100,
    //   async container => {
    //     await store.setContainerMetadata(container);
    //   }
    // );
    await Promise.all([
      updateBlocksPro,
      updateBlocksPro1,
      updateBlocksPro2,
      updateBlocksPro3,
      updateBlocksPro4
    ]);
    // await Promise.all([updateBlocksPro, updateContainersPro]);

    const end = new Date();
    console.log(end.getTime() - start.getTime());
  });
});
