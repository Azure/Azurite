import * as assert from "assert";

import IExtentMetadataStore, {
  IExtentModel
} from "../../../src/common/persistence/IExtentMetadataStore";
import SqlExtentMetadataStore from "../../../src/common/persistence/SqlExtentMetadataStore";

// TODO: Collect database URI from environment variable. If not, skip these cases
// TODO: Make sure DB has been initialized with required tables and rows. Make it automatically in the future
// Make sure DB has been booted
const DB_URI =
  "mariadb://root:my-secret-pw@127.0.0.1:3306/azurite_extent_metadata";

// TODO: Make test cases shared cross all IBlobMetadataStore implementations
let store: IExtentMetadataStore;

describe("SqlExtentMetadataStore", () => {
  before(async () => {
    store = new SqlExtentMetadataStore(DB_URI, {
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

  it("Insert extent by update a new extentModel", async () => {
    const extentId = `extentId_${new Date().getTime()}`;
    const persistencyId = `persistencyId_${new Date().getTime()}`;
    const lastModifiedInMS = Date.now();

    const extent = {
      id: extentId,
      persistencyId: persistencyId,
      path: extentId,
      size: 0,
      lastModifiedInMS: lastModifiedInMS
    };
    await store.updateExtent(extent);
    const res = await store.listExtents(extentId, 1);

    assert.deepStrictEqual(res![0][0], extent);
  });

  it("Update an exist extent", async () => {
    const extentId = `extentId_${new Date().getTime()}`;
    const persistencyId = `persistencyId_${new Date().getTime()}`;
    const lastModifiedInMS = Date.now();

    const count = 5;
    for (let i = 0; i < count; i++) {
      const extent = {
        id: `${extentId}_${i}`,
        persistencyId: persistencyId,
        path: extentId,
        size: i,
        lastModifiedInMS: lastModifiedInMS
      };
      await store.updateExtent(extent);
    }

    for (let i = 0; i < count; i++) {
      const extent = {
        id: `${extentId}_${i}`,
        persistencyId: persistencyId,
        path: extentId,
        size: i * 2 + 100,
        lastModifiedInMS: lastModifiedInMS
      };
      await store.updateExtent(extent);
    }

    for (let i = 0; i < count; i++) {
      const res = await store.listExtents(`${extentId}_${i}`);
      assert.ok(res[0].length === 1);
      assert.ok(res![0][0].size === i * 2 + 100);
    }
  });

  let perfTestExtentId: string = `perf_${new Date().getTime()}`;
  it("Create 1000 extents.", async () => {
    const extentId = perfTestExtentId;
    const persistencyId = `persistencyId_${new Date().getTime()}`;
    const lastModifiedInMS = Date.now();

    const count = 1000;

    const createOp: Promise<any>[] = [];
    for (let i = 0; i < count; i++) {
      const extent: IExtentModel = {
        id: `${extentId}_${i}`,
        persistencyId: persistencyId,
        path: extentId,
        size: i,
        lastModifiedInMS: lastModifiedInMS
      };

      createOp.push(store.updateExtent(extent));
    }

    await Promise.all(createOp);
  });

  it("Update 1000 exist extents.", async () => {
    const extentId = perfTestExtentId;
    const persistencyId = `persistencyId_${new Date().getTime()}`;
    const lastModifiedInMS = Date.now();

    const count = 1000;

    const updateOp: Promise<any>[] = [];
    for (let i = 0; i < count; i++) {
      const extent = {
        id: `${extentId}_${i}`,
        persistencyId: persistencyId,
        path: extentId,
        size: i * 2 + 100,
        lastModifiedInMS: lastModifiedInMS
      };
      updateOp.push(store.updateExtent(extent));
    }

    await Promise.all(updateOp);
  });

  it("Check the 1000 updated extents.", async () => {
    const extentId = perfTestExtentId;
    const persistencyId = `persistencyId_${new Date().getTime()}`;
    const lastModifiedInMS = Date.now();

    const count = 1000;

    const listOp: Promise<any>[] = [];
    for (let i = 0; i < count; i++) {
      listOp.push(store.listExtents(`${extentId}_${i}`));
    }

    const res = await Promise.all(listOp);
    const extent = {
      id: ``,
      persistencyId: persistencyId,
      path: extentId,
      size: 0,
      lastModifiedInMS: lastModifiedInMS
    };
    for (let i = 0; i < count; i++) {
      extent.id = `${extentId}_${i}`;
      extent.size = i * 2;
      assert.ok(res[i][0][0].size === i * 2 + 100);
    }
  });
});
