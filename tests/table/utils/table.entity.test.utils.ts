import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../../testutils";
import { TestEntity } from "../models/TestEntity";
import TableServer from "../../../src/table/TableServer";
import TableConfiguration from "../../../src/table/TableConfiguration";
import { AzureNamedKeyCredential, TableClient } from "@azure/data-tables";
import { copyFile } from "fs";

export const PROTOCOL = "http";
export const HOST = "127.0.0.1";
export const PORT = 11002;
const metadataDbPath = "__tableTestsStorage__";
const enableDebugLog: boolean = false;
const debugLogPath: string = "g:/debug.log";
const connectionString =
  `DefaultEndpointsProtocol=${PROTOCOL};AccountName=${EMULATOR_ACCOUNT_NAME};` +
  `AccountKey=${EMULATOR_ACCOUNT_KEY};TableEndpoint=${PROTOCOL}://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME};`;
const secondaryConnectionString =
  `DefaultEndpointsProtocol=${PROTOCOL};AccountName=${EMULATOR_ACCOUNT_NAME};` +
  `AccountKey=${EMULATOR_ACCOUNT_KEY};TableEndpoint=${PROTOCOL}://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}-secondary;`;
const AZURE_TABLE_STORAGE: string = "AZURE_TABLE_STORAGE";
const AZURE_DATATABLES_STORAGE_STRING = "AZURE_DATATABLES_STORAGE_STRING";
const AZURE_DATATABLES_SAS = "AZURE_DATATABLES_SAS";
const AZURITE_TABLE_BASE_URL = "AZURITE_TABLE_BASE_URL";
// Azure Pipelines need a unique name per test instance
// const REPRO_DB_PATH = "./querydb.json";

const config = new TableConfiguration(
  HOST,
  PORT,
  metadataDbPath,
  enableDebugLog,
  false,
  undefined,
  debugLogPath
);

const httpsConfig = new TableConfiguration(
  HOST,
  PORT,
  metadataDbPath,
  enableDebugLog,
  false,
  undefined,
  debugLogPath,
  false,
  true,
  "tests/server.cert",
  "tests/server.key"
);

/**
 * Creates an entity for tests, with a randomized row key,
 * to avoid conflicts on inserts.
 *
 * @return {*}  {TestEntity}
 */
export function createBasicEntityForTest(): TestEntity {
  return new TestEntity("part1", getUniqueName("row"), "value1");
}

/**
 * Creates the Azurite TableServer used in Table API tests
 *
 * @export
 * @return {*}  {TableServer}
 */
export function createTableServerForTest(): TableServer {
  return new TableServer(config);
}

export function createTableServerForTestHttps(): TableServer {
  return new TableServer(httpsConfig);
}

/**
 * Creates a copy of the legacy schema database to use in tests
 * and to ensure backwards compatability.
 *
 * @export
 * @return {*}  {TableServer}
 */
export function createTableServerForQueryTestHttps(): TableServer {
  // we need a unique name for the pipieline tests which
  // all run on the same VM.
  const uniqueDbName = getUniqueName("querydb");
  const uniqueDBpath = "./" + uniqueDbName + ".json";
  duplicateReproDBForTest(uniqueDBpath);
  const queryConfig = createQueryConfig(uniqueDBpath);
  return new TableServer(queryConfig);
}

export function createTableServerForTestOAuth(oauth?: string): TableServer {
  const oAuthConfig = new TableConfiguration(
    HOST,
    PORT,
    metadataDbPath,
    enableDebugLog,
    false,
    undefined,
    debugLogPath,
    false,
    true,
    undefined,
    undefined,
    undefined,
    oauth
  );
  return new TableServer(oAuthConfig);
}

/**
 * Provides the connection string to connect to the Azurite table server
 * or connects to a real Azure Table Service in the cloud
 * @export
 * @return {*}  {string}
 */
export function createConnectionStringForTest(dev: boolean): string {
  if (dev) {
    return connectionString;
  } else {
    return process.env[AZURE_TABLE_STORAGE]!;
  }
}

/**
 * provides the base URL of Azurite or the service to create SaS
 * connections.
 *
 * @export
 * @param {boolean} dev
 * @return {*}  {string}
 */
export function getBaseUrlForTest(dev: boolean = true): string {
  if (dev) {
    return `${PROTOCOL}://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}`;
  } else {
    return (process.env[AZURITE_TABLE_BASE_URL] ??= "");
  }
}

/**
 * Provides the connection string to connect to the Azurite table server's secondary location endpoint
 * or connects to a real Azure Table Service in the cloud
 * @export
 * @return {*}  {string}
 */
export function createSecondaryConnectionStringForTest(dev: boolean): string {
  if (dev) {
    return secondaryConnectionString;
  } else {
    return process.env[AZURE_TABLE_STORAGE]!;
  }
}

/**
 * return a unique parition key for data-tables tests
 *
 * @export
 * @return {*}  {string}
 */
export function createUniquePartitionKey(name?: string | undefined): string {
  if (name === undefined) {
    return getUniqueName("datatablestests");
  }
  return getUniqueName(name);
}

/**
 * creates an Azure Data Tables client for local or service tests
 *
 * @export
 * @param {boolean} local
 * @param {string} tableName
 * @return {*}  {TableClient}
 */
export function createAzureDataTablesClient(
  local: boolean,
  tableName: string
): TableClient {
  if (local) {
    const sharedKeyCredential = new AzureNamedKeyCredential(
      EMULATOR_ACCOUNT_NAME,
      EMULATOR_ACCOUNT_KEY
    );

    return new TableClient(
      `https://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}`,
      tableName,
      sharedKeyCredential
    );
  } else {
    return new TableClient(
      process.env[AZURE_DATATABLES_STORAGE_STRING]! +
        process.env[AZURE_DATATABLES_SAS]!,
      tableName
    );
  }
}

/**
 * Default behavior will overwrite target.
 * This will copy the old db file with older schema on which we then
 * run our tests to ensure backwards compatability.
 *
 */
function duplicateReproDBForTest(uniqueDBpath: string) {
  copyFile(
    "./tests/table/database/__db_table_guid_bin__.json",
    uniqueDBpath,
    (exception) => {
      if (exception) {
        throw exception;
      }
    }
  );
}

function createQueryConfig(uniqueDBpath: string): TableConfiguration {
  const queryConfig = new TableConfiguration(
    HOST,
    PORT,
    uniqueDBpath, // contains guid and binProp object from legacy schema DB
    enableDebugLog,
    false,
    undefined,
    debugLogPath,
    false,
    true,
    "tests/server.cert",
    "tests/server.key"
  );
  return queryConfig;
}
