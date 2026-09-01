import * as assert from "assert";
import { QueryTypes, Sequelize } from "sequelize";

import * as Models from "../../src/blob/generated/artifacts/models";
import Context from "../../src/blob/generated/Context";
import SqlBlobMetadataStore from "../../src/blob/persistence/SqlBlobMetadataStore";
import { DEFAULT_SQL_OPTIONS } from "../../src/common/utils/constants";

/**
 * Exercises the mysql2/Sequelize connection pool used by the SQL metadata
 * store. Only runs against a real database, so it is tagged @sql and is
 * skipped when AZURITE_TEST_DB is not configured.
 */
describe("SqlBlobMetadataStore connection pool @sql", () => {
  const connectionURI = process.env.AZURITE_TEST_DB;
  const accountName = "devstoreaccount1";
  const containerPrefix = `poolcontainer${new Date().getTime()}`;
  const concurrency = DEFAULT_SQL_OPTIONS.pool.max;

  let store: SqlBlobMetadataStore;

  function createContext(id: string): Context {
    const context = new Context(
      { contextId: id },
      "testPath",
      {} as any,
      {} as any
    );
    context.startTime = new Date();
    return context;
  }

  before(async function () {
    if (connectionURI === undefined) {
      this.skip();
    }

    // SqlBlobMetadataStore mutates dialectOptions in place for mssql:// URIs,
    // so clone that nested object rather than only shallow-spreading
    // DEFAULT_SQL_OPTIONS, to avoid leaking config into other tests.
    store = new SqlBlobMetadataStore(connectionURI!, {
      ...DEFAULT_SQL_OPTIONS,
      dialectOptions: { ...DEFAULT_SQL_OPTIONS.dialectOptions }
    });
    await store.init();
  });

  after(async () => {
    if (store !== undefined) {
      await store.close();
    }
  });

  it("handles concurrent operations across pooled connections", async () => {
    const containerNames = Array.from(
      { length: concurrency },
      (_, index) => `${containerPrefix}-${index}`
    );

    await Promise.all(
      containerNames.map((name, index) =>
        store.createContainer(createContext(`create-${index}`), {
          accountName,
          name,
          metadata: { poolIndex: `${index}` },
          properties: {
            etag: `"pool${index}"`,
            lastModified: new Date(),
            leaseStatus: Models.LeaseStatusType.Unlocked,
            leaseState: Models.LeaseStateType.Available,
            hasImmutabilityPolicy: false,
            hasLegalHold: false
          }
        })
      )
    );

    const properties = await Promise.all(
      containerNames.map((name, index) =>
        store.getContainerProperties(
          createContext(`get-${index}`),
          accountName,
          name
        )
      )
    );

    properties.forEach((property, index) => {
      assert.strictEqual(property.name, containerNames[index]);
      assert.strictEqual(property.metadata!.poolIndex, `${index}`);
    });

    await Promise.all(
      containerNames.map((name, index) =>
        store.deleteContainer(
          createContext(`delete-${index}`),
          accountName,
          name
        )
      )
    );

    const [remaining] = await store.listContainers(
      createContext("list"),
      accountName,
      containerPrefix,
      concurrency,
      ""
    );
    assert.deepStrictEqual(remaining, []);
  });

  it("reports errors from a pooled connection without breaking the pool", async () => {
    const name = `${containerPrefix}-conflict`;
    const container = {
      accountName,
      name,
      metadata: {},
      properties: {
        etag: `"conflict"`,
        lastModified: new Date(),
        leaseStatus: Models.LeaseStatusType.Unlocked,
        leaseState: Models.LeaseStateType.Available,
        hasImmutabilityPolicy: false,
        hasLegalHold: false
      }
    };

    await store.createContainer(createContext("conflict-1"), container);

    let error: any;
    try {
      await store.createContainer(createContext("conflict-2"), container);
    } catch (err) {
      error = err;
    }
    assert.notStrictEqual(error, undefined);
    assert.strictEqual(error.statusCode, 409);

    // The pool must still be usable after a rejected query.
    const properties = await store.getContainerProperties(
      createContext("conflict-3"),
      accountName,
      name
    );
    assert.strictEqual(properties.name, name);

    await store.deleteContainer(createContext("conflict-4"), accountName, name);
  });

  it("executes a three-byte length-coded parameter", async () => {
    const value = "x".repeat(70 * 1024);

    const result = await getSequelize(store).query<{ value: string }>(
      "SELECT $value AS value",
      {
        bind: { value },
        type: QueryTypes.SELECT
      }
    );

    assert.strictEqual(result[0].value, value);
  });

  function getSequelize(store: SqlBlobMetadataStore): Sequelize {
    return (store as any).sequelize;
  }
});
