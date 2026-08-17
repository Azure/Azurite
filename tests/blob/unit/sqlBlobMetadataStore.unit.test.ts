import * as assert from "assert";
import * as mysql2 from "mysql2";
import { Sequelize } from "sequelize";

import SqlBlobMetadataStore from "../../../src/blob/persistence/SqlBlobMetadataStore";
import {
  DEFAULT_SQL_CHARSET,
  DEFAULT_SQL_COLLATE,
  DEFAULT_SQL_OPTIONS
} from "../../../src/common/utils/constants";

/**
 * These tests exercise the driver wiring of the SQL metadata store without
 * requiring a live database. Creating a Sequelize instance resolves and loads
 * the dialect driver module, which is `mysql2` for `mysql://` connection URIs.
 */
describe("SqlBlobMetadataStore driver resolution @loki", () => {
  function getSequelize(store: SqlBlobMetadataStore): Sequelize {
    return (store as any).sequelize as Sequelize;
  }

  it("loads the mysql2 driver for mysql connection URIs", () => {
    const store = new SqlBlobMetadataStore(
      "mysql://azurite@127.0.0.1:3306/azurite_blob_test",
      { ...DEFAULT_SQL_OPTIONS }
    );

    const sequelize = getSequelize(store);
    assert.strictEqual(sequelize.getDialect(), "mysql");

    const lib = (sequelize as any).dialect.connectionManager.lib;
    assert.strictEqual(
      lib.createConnection,
      mysql2.createConnection,
      "Sequelize should use the mysql2 package as its MySQL driver"
    );
    assert.strictEqual(typeof lib.createPool, "function");
  });

  it("passes the default charset, collation and pool options to the driver", () => {
    const store = new SqlBlobMetadataStore(
      "mysql://azurite@127.0.0.1:3306/azurite_blob_test",
      { ...DEFAULT_SQL_OPTIONS }
    );

    const options = (getSequelize(store) as any).options;
    assert.strictEqual(options.charset, DEFAULT_SQL_CHARSET);
    assert.strictEqual(options.collate, DEFAULT_SQL_COLLATE);
    assert.strictEqual(options.pool.max, DEFAULT_SQL_OPTIONS.pool.max);
    assert.strictEqual(
      options.dialectOptions.timezone,
      DEFAULT_SQL_OPTIONS.dialectOptions.timezone
    );
  });

  it("does not enable SQL Server encryption for mysql connection URIs", () => {
    const sequelizeOptions = {
      ...DEFAULT_SQL_OPTIONS,
      dialectOptions: { ...DEFAULT_SQL_OPTIONS.dialectOptions }
    };
    new SqlBlobMetadataStore(
      "mysql://azurite@127.0.0.1:3306/azurite_blob_test",
      sequelizeOptions
    );

    assert.strictEqual(
      (sequelizeOptions.dialectOptions as any).options,
      undefined
    );
  });

  it("enables encryption for mssql connection URIs", () => {
    const sequelizeOptions = {
      ...DEFAULT_SQL_OPTIONS,
      dialectOptions: { ...DEFAULT_SQL_OPTIONS.dialectOptions }
    };
    const store = new SqlBlobMetadataStore(
      "mssql://azurite@127.0.0.1:1433/azurite_blob_test",
      sequelizeOptions
    );

    assert.strictEqual(getSequelize(store).getDialect(), "mssql");
    assert.strictEqual(
      (sequelizeOptions.dialectOptions as any).options.encrypt,
      true
    );
  });

  it("escapes multi-byte values through the mysql2 driver", () => {
    assert.strictEqual(
      mysql2.format("SELECT ? AS blobName", ["中文-name'"]),
      "SELECT '中文-name\\'' AS blobName"
    );
  });
});
