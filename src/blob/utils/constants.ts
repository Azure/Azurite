import { StoreDestinationArray } from "../../common/persistence/IExtentStore";
import * as Models from "../generated/artifacts/models";

export const VERSION = "3.3.0-preview";
export const BLOB_API_VERSION = "2019-02-02";
export const DEFAULT_BLOB_SERVER_HOST_NAME = "127.0.0.1"; // Change to 0.0.0.0 when needs external access
export const DEFAULT_LIST_BLOBS_MAX_RESULTS = 5000;
export const DEFAULT_BLOB_LISTENING_PORT = 10000;
export const IS_PRODUCTION = process.env.NODE_ENV === "production";
export const DEFAULT_BLOB_LOKI_DB_PATH = "__azurite_db_blob__.json";
export const DEFAULT_BLOB_EXTENT_LOKI_DB_PATH =
  "__azurite_db_blob_extent__.json";
export const DEFAULT_BLOB_PERSISTENCE_PATH = "__blobstorage__";
export const DEFAULT_DEBUG_LOG_PATH = "./debug.log";
export const DEFAULT_ENABLE_DEBUG_LOG = true;
export const DEFAULT_ACCESS_LOG_PATH = "./access.log";
export const DEFAULT_ENABLE_ACCESS_LOG = true;
export const DEFAULT_CONTEXT_PATH = "azurite_blob_context";
export const LOGGER_CONFIGS = {};
export const DEFAULT_GC_INTERVAL_MS = 10 * 60 * 1000;
export const EMULATOR_ACCOUNT_NAME = "devstoreaccount1";
export const EMULATOR_ACCOUNT_KEY = Buffer.from(
  "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
  "base64"
);

export const EMULATOR_ACCOUNT_SKUNAME = Models.SkuName.StandardRAGRS;
export const EMULATOR_ACCOUNT_KIND = Models.AccountKind.StorageV2;

export const HeaderConstants = {
  AUTHORIZATION: "authorization",
  AUTHORIZATION_SCHEME: "Bearer",
  CONTENT_ENCODING: "content-encoding",
  CONTENT_LANGUAGE: "content-language",
  CONTENT_LENGTH: "content-length",
  CONTENT_MD5: "content-md5",
  CONTENT_TYPE: "content-type",
  COOKIE: "Cookie",
  DATE: "date",
  IF_MATCH: "if-match",
  IF_MODIFIED_SINCE: "if-modified-since",
  IF_NONE_MATCH: "if-none-match",
  IF_UNMODIFIED_SINCE: "if-unmodified-since",
  PREFIX_FOR_STORAGE: "x-ms-",
  RANGE: "Range",
  USER_AGENT: "User-Agent",
  X_MS_CLIENT_REQUEST_ID: "x-ms-client-request-id",
  X_MS_DATE: "x-ms-date",
  SERVER: "Server"
};

export const SECONDARY_SUFFIX = "-secondary";

export const DEFAULT_BLOB_PERSISTENCE_ARRAY: StoreDestinationArray = [
  {
    persistencyId: "Default",
    persistencyPath: DEFAULT_BLOB_PERSISTENCE_PATH,
    maxConcurrency: 10
  }
];

export const DEFAULT_SQL_CHARSET = "utf8mb4";
// Use utf8mb4_bin instead of utf8mb4_general_ci to honor case sensitive
// https://dev.mysql.com/doc/refman/8.0/en/case-sensitivity.html
export const DEFAULT_SQL_COLLATE = "utf8mb4_bin";

export const DEFAULT_SQL_OPTIONS = {
  logging: false,
  pool: {
    max: 20,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  dialectOptions: {
    timezone: "Etc/GMT-0"
  },
  charset: DEFAULT_SQL_CHARSET,
  collate: DEFAULT_SQL_COLLATE
};
