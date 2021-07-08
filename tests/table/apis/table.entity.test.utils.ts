import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../../testutils";
import { TestEntity } from "./TestEntity";
import TableServer from "../../../src/table/TableServer";
import TableConfiguration from "../../../src/table/TableConfiguration";

export const PROTOCOL = "http";
export const HOST = "127.0.0.1";
export const PORT = 11002;
const metadataDbPath = "__tableTestsStorage__";
const enableDebugLog: boolean = false;
const debugLogPath: string = "g:/debug.log";
const connectionString =
  `DefaultEndpointsProtocol=${PROTOCOL};AccountName=${EMULATOR_ACCOUNT_NAME};` +
  `AccountKey=${EMULATOR_ACCOUNT_KEY};TableEndpoint=${PROTOCOL}://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME};`;
const AZURE_TABLE_STORAGE: string = "AZURE_TABLE_STORAGE";

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
 * return a unique parition key for data-tables tests
 *
 * @export
 * @return {*}  {string}
 */
export function createUniquePartitionKey(): string {
  return getUniqueName("datatablestests");
}
