import * as crypto from "crypto";

import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../../testutils";

import TableServer from "../../../src/table/TableServer";
import {
  AzureNamedKeyCredential,
  AzureSASCredential,
  TableClient,
  TableServiceClient
} from "@azure/data-tables";
import { copyFile } from "fs";
import TableTestServerFactory, {
  ITableTestServerFactoryParams
} from "./TableTestServerFactory";
import {
  createDefaultHttpClient,
  HttpClient,
  PipelineRequest,
  PipelineResponse
} from "@azure/core-rest-pipeline";

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

/**
 * Creates the Azurite TableServer used in Table API tests
 *
 * @export
 * @return {*}  {TableServer}
 */
export function createTableServerForTest(): TableServer {
  return new TableTestServerFactory().createServer({
    metadataDBPath: metadataDbPath,
    enableDebugLog: enableDebugLog,
    debugLogFilePath: debugLogPath,
    loose: false,
    skipApiVersionCheck: false,
    https: false
  });
}

export function createTableServerForTestHttps(): TableServer {
  return new TableTestServerFactory().createServer({
    metadataDBPath: metadataDbPath,
    enableDebugLog: enableDebugLog,
    debugLogFilePath: debugLogPath,
    loose: false,
    skipApiVersionCheck: true,
    https: true
  });
}

/**
 * Creates a copy of the legacy schema database to use in tests
 * and to ensure backwards compatability.
 *
 * @export
 * @return {*}  {TableServer}
 */
export function createTableServerForQueryTestHttps(): TableServer {
  // we need a unique name for the pipeline tests which
  // all run on the same VM.
  const uniqueDbName = getUniqueName("querydb");
  const uniqueDBpath = "./" + uniqueDbName + ".json";
  duplicateReproDBForTest(uniqueDBpath);
  const queryConfig = createQueryConfig(uniqueDBpath);
  return new TableTestServerFactory().createServer(queryConfig);
}

export function createTableServerForTestOAuth(oauth?: string): TableServer {
  return new TableTestServerFactory().createServer({
    metadataDBPath: metadataDbPath,
    enableDebugLog: enableDebugLog,
    debugLogFilePath: debugLogPath,
    loose: false,
    skipApiVersionCheck: true,
    https: false,
    oauth: oauth
  });
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
 * return a unique partition key for data-tables tests
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
    // return new TableClient(
    //   process.env[AZURE_DATATABLES_STORAGE_STRING]! +
    //     process.env[AZURE_DATATABLES_SAS]!,
    //   tableName
    // );

    return new TableClient(
      process.env[AZURE_DATATABLES_STORAGE_STRING]!,
      tableName,
      new AzureSASCredential(process.env[AZURE_DATATABLES_SAS]!)
    );
  }
}
/**
 * creates an Azure Data Tables client for local or service tests
 *
 * @export
 * @param {boolean} local
 * @param {string} tableName
 * @return {*}  {TableClient}
 */
export function createAzureDataTableServiceClient(
  local: boolean
): TableServiceClient {
  if (local) {
    const sharedKeyCredential = new AzureNamedKeyCredential(
      EMULATOR_ACCOUNT_NAME,
      EMULATOR_ACCOUNT_KEY
    );

    return new TableServiceClient(
      `https://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}`,
      sharedKeyCredential
    );
  } else {
    // return new TableClient(
    //   process.env[AZURE_DATATABLES_STORAGE_STRING]! +
    //     process.env[AZURE_DATATABLES_SAS]!,
    //   tableName
    // );

    return new TableServiceClient(
      process.env[AZURE_DATATABLES_STORAGE_STRING]!,
      new AzureSASCredential(process.env[AZURE_DATATABLES_SAS]!)
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

function createQueryConfig(
  uniqueDBpath: string
): ITableTestServerFactoryParams {
  return {
    metadataDBPath: uniqueDBpath, // contains guid and binProp object from legacy schema DB
    enableDebugLog: enableDebugLog,
    debugLogFilePath: debugLogPath,
    loose: false,
    skipApiVersionCheck: true,
    https: true
  };
}

export function createHttpClientForTest(
  overrideHeaders: Record<string, string>,
  capture: { headers?: any; body?: any; status?: number }
): HttpClient {
  const defaultClient = createDefaultHttpClient();

  return {
    async sendRequest(request: PipelineRequest): Promise<PipelineResponse> {
      // inject headers
      for (const key of Object.keys(overrideHeaders)) {
        request.headers.set(key, overrideHeaders[key]);
      }

      const response = await defaultClient.sendRequest(request);

      // capture response
      capture.status = response.status;
      capture.headers = response.headers.toJSON();

      try {
        capture.body = JSON.parse(response.bodyAsText ?? "");
      } catch {
        capture.body = response.bodyAsText;
      }

      return response;
    }
  };
}

export function generateTableSasToken({
  accountName,
  accountKey,
  tableName,
  permissions,
  start,
  expiry
}: {
  accountName: string;
  accountKey: string;
  tableName: string;
  permissions: string;
  start?: string;
  expiry: string;
}) {
  const version = "2020-10-02";
  const protocol = "https,http";
  const signedStart = start ?? "";

  // Table service SAS string-to-sign (sv >= 2018-11-09):
  // signedpermissions + "\n" +
  // signedstart + "\n" +
  // signedexpiry + "\n" +
  // canonicalizedresource + "\n" +
  // signedidentifier + "\n" +
  // signedIP + "\n" +
  // signedProtocol + "\n" +
  // signedversion + "\n" +
  // startingPartitionKey + "\n" +
  // startingRowKey + "\n" +
  // endingPartitionKey + "\n" +
  // endingRowKey
  //
  // The canonicalized resource must use the lower-cased table name to match
  // the service authenticator (getCanonicalName lower-cases the table name).
  const stringToSign =
    `${permissions}\n` +
    `${signedStart}\n` +
    `${expiry}\n` +
    `/table/${accountName}/${tableName.toLowerCase()}\n` +
    `\n` + // signedIdentifier
    `\n` + // signedIP
    `${protocol}\n` +
    `${version}\n` +
    `\n` + // startingPartitionKey
    `\n` + // startingRowKey
    `\n` + // endingPartitionKey
    ``; // endingRowKey

  const signature = crypto
    .createHmac("sha256", Uint8Array.from(Buffer.from(accountKey, "base64")))
    .update(stringToSign, "utf8")
    .digest("base64");

  return (
    `sv=${version}` +
    `&tn=${tableName}` +
    `&sp=${permissions}` +
    (signedStart ? `&st=${encodeURIComponent(signedStart)}` : "") +
    `&se=${encodeURIComponent(expiry)}` +
    `&spr=${encodeURIComponent(protocol)}` +
    `&sig=${encodeURIComponent(signature)}`
  );
}

export function generateTableAccountSasToken({
  accountName,
  accountKey,
  permissions,
  start,
  expiry
}: {
  accountName: string;
  accountKey: string;
  permissions: string;
  start?: string;
  expiry: string;
}) {
  const version = "2020-10-02";
  const services = "t";
  const resourceTypes = "sco";
  const protocol = "https,http";
  const signedStart = start ?? "";

  // Account SAS string-to-sign shape:
  // accountname + "\n" +
  // signedpermissions + "\n" +
  // signedservice + "\n" +
  // signedresourcetype + "\n" +
  // signedstart + "\n" +
  // signedexpiry + "\n" +
  // signedIP + "\n" +
  // signedProtocol + "\n" +
  // signedversion + "\n"
  const stringToSign =
    `${accountName}\n` +
    `${permissions}\n` +
    `${services}\n` +
    `${resourceTypes}\n` +
    `${signedStart}\n` +
    `${expiry}\n` +
    `\n` + // signedIP
    `${protocol}\n` +
    `${version}\n`;

  const signature = crypto
    .createHmac("sha256", Uint8Array.from(Buffer.from(accountKey, "base64")))
    .update(stringToSign, "utf8")
    .digest("base64");

  return (
    `sv=${version}` +
    `&ss=${services}` +
    `&srt=${resourceTypes}` +
    `&sp=${permissions}` +
    (signedStart ? `&st=${encodeURIComponent(signedStart)}` : "") +
    `&se=${encodeURIComponent(expiry)}` +
    `&spr=${encodeURIComponent(protocol)}` +
    `&sig=${encodeURIComponent(signature)}`
  );
}

export function generateTableServiceSasWithIdentifier({
  accountName,
  accountKey,
  tableName,
  identifier
}: {
  accountName: string;
  accountKey: string;
  tableName: string;
  identifier: string;
}) {
  const version = "2020-10-02";
  const protocol = "https,http";

  // Service SAS string-to-sign for tables:
  // sp + "\n" +
  // st + "\n" +
  // se + "\n" +
  // canonicalizedResource + "\n" +
  // si + "\n" +
  // sip + "\n" +
  // spr + "\n" +
  // sv + "\n" +
  // startPk + "\n" +
  // startRk + "\n" +
  // endPk + "\n" +
  // endRk
  //
  // For stored access policy usage, permissions/start/expiry are taken from the ACL,
  // so the ad hoc fields are blank and only signedIdentifier is populated.
  const stringToSign =
    "\n" + // signedPermissions
    "\n" + // signedStart
    "\n" + // signedExpiry
    `/table/${accountName}/${tableName.toLowerCase()}\n` +
    `${identifier}\n` +
    "\n" + // signedIP
    `${protocol}\n` +
    `${version}\n` +
    "\n" + // startPartitionKey
    "\n" + // startRowKey
    "\n" + // endPartitionKey
    ""; // endRowKey

  const signature = crypto
    .createHmac("sha256", Uint8Array.from(Buffer.from(accountKey, "base64")))
    .update(stringToSign, "utf8")
    .digest("base64");

  return (
    `sv=${version}` +
    `&si=${encodeURIComponent(identifier)}` +
    `&spr=${encodeURIComponent(protocol)}` +
    `&sig=${encodeURIComponent(signature)}`
  );
}
