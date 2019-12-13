import { StoreDestinationArray } from "../../common/persistence/IExtentStore";
import * as Models from "../generated/artifacts/models";

export const VERSION = "3.3.0-preview";
export const BLOB_API_VERSION = "2019-02-02";
export const DEFAULT_BLOB_SERVER_HOST_NAME = "127.0.0.1"; // Change to 0.0.0.0 when needs external access
export const DEFAULT_LIST_BLOBS_MAX_RESULTS = 5000;
export const DEFAULT_LIST_CONTAINERS_MAX_RESULTS = 5000;
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
  SERVER: "Server",
  X_MS_META: "x-ms-meta-",
  ORIGIN: "origin",
  VARY: "Vary",
  ACCESS_CONTROL_EXPOSED_HEADER: "Access-Control-Exposed-Headers",
  ACCESS_CONTROL_ALLOW_ORIGIN: "Access-Control-Allow-Origin",
  ACCESS_CONTROL_ALLOW_CREDENTIALS: "Access-Control-Allow-Credentials",
  ACCESS_CONTROL_ALLOW_METHODS: "Access-Control-Allow-Methods",
  ACCESS_CONTROL_ALLOW_HEADERS: "Access-Control-Allow-Headers",
  ACCESS_CONTROL_MAX_AGE: "Access-Control-Max-Age",
  ACCESS_CONTROL_REQUEST_METHOD: "access-control-request-method",
  ACCESS_CONTROL_REQUEST_HEADERS: "access-control-request-headers"
};

export const MethodConstants = {
  OPTIONS: "OPTIONS"
};

export const SECONDARY_SUFFIX = "-secondary";

export const DEFAULT_BLOB_PERSISTENCE_ARRAY: StoreDestinationArray = [
  {
    persistencyId: "Default",
    persistencyPath: DEFAULT_BLOB_PERSISTENCE_PATH,
    maxConcurrency: 10
  }
];
