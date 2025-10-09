import { StoreDestinationArray } from "../../common/persistence/IExtentStore";
import * as Models from "../generated/artifacts/models";

export const VERSION = "3.35.0";
export const BLOB_API_VERSION = "2025-11-05";
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
export const DEFAULT_WRITE_CONCURRENCY_PER_LOCATION = 50;
export const EMULATOR_ACCOUNT_NAME = "devstoreaccount1";
export const EMULATOR_ACCOUNT_KEY_STR =
  "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==";
export const EMULATOR_ACCOUNT_KEY = Buffer.from(
  EMULATOR_ACCOUNT_KEY_STR,
  "base64"
);

export const EMULATOR_ACCOUNT_SKUNAME = Models.SkuName.StandardRAGRS;
export const EMULATOR_ACCOUNT_KIND = Models.AccountKind.StorageV2;
export const EMULATOR_ACCOUNT_ISHIERARCHICALNAMESPACEENABLED = false;
export const DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT = 5;


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
  SOURCE_IF_MATCH: "x-ms-source-if-match",
  SOURCE_IF_MODIFIED_SINCE: "x-ms-source-if-modified-since",
  SOURCE_IF_NONE_MATCH: "x-ms-source-if-none-match",
  SOURCE_IF_UNMODIFIED_SINCE: "x-ms-source-if-unmodified-since",
  X_MS_IF_SEQUENCE_NUMBER_LE: "x-ms-if-sequence-number-le",
  X_MS_IF_SEQUENCE_NUMBER_LT: "x-ms-if-sequence-number-lt",
  X_MS_IF_SEQUENCE_NUMBER_EQ: "x-ms-if-sequence-number-eq",
  X_MS_BLOB_CONDITION_MAXSIZE: "x-ms-blob-condition-maxsize",
  X_MS_BLOB_CONDITION_APPENDPOS: "x-ms-blob-condition-appendpos",
  X_MS_SEQUENCE_NUMBER_ACTION: "x-ms-sequence-number-action",
  X_MS_BLOB_SEQUENCE_NUMBER: "x-ms-blob-sequence-number",
  X_MS_CONTENT_CRC64: "x-ms-content-crc64",
  X_MS_RANGE_GET_CONTENT_CRC64: "x-ms-range-get-content-crc64",
  X_MS_ENCRYPTION_KEY: "x-ms-encryption-key",
  X_MS_ENCRYPTION_KEY_SHA256: "x-ms-encryption-key-sha256",
  X_MS_ENCRYPTION_ALGORITHM: "x-ms-encryption-algorithm",
  PREFIX_FOR_STORAGE: "x-ms-",
  RANGE: "Range",
  USER_AGENT: "User-Agent",
  X_MS_CLIENT_REQUEST_ID: "x-ms-client-request-id",
  X_MS_DATE: "x-ms-date",
  SERVER: "Server",
  X_MS_META: "x-ms-meta-",
  X_MS_VERSION: "x-ms-version",
  ORIGIN: "origin",
  VARY: "Vary",
  ACCESS_CONTROL_EXPOSE_HEADERS: "Access-Control-Expose-Headers",
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
    locationId: "Default",
    locationPath: DEFAULT_BLOB_PERSISTENCE_PATH,
    maxConcurrency: DEFAULT_WRITE_CONCURRENCY_PER_LOCATION
  }
];

export const ValidAPIVersions = [
  "2025-11-05",
  "2025-07-05",
  "2025-05-05",
  "2025-01-05",
  "2024-11-04",
  "2024-08-04",
  "2024-05-04",
  "2024-02-04",
  "2023-11-03",
  "2023-08-03",
  "2023-01-03",
  "2022-11-02",
  "2021-12-02",
  "2021-10-04",
  "2021-08-06",
  "2021-06-08",
  "2021-04-10",
  "2021-02-12",
  "2020-12-06",
  "2020-10-02",
  "2020-08-04",
  "2020-06-12",
  "2020-04-08",
  "2020-02-10",
  "2019-12-12",
  "2019-10-10",
  "2019-07-07",
  "2019-02-02",
  "2018-11-09",
  "2018-03-28",
  "2017-11-09",
  "2017-07-29",
  "2017-04-17",
  "2016-05-31",
  "2015-12-11",
  "2015-07-08",
  "2015-04-05",
  "2015-02-21",
  "2014-02-14",
  "2013-08-15",
  "2012-02-12",
  "2011-08-18",
  "2009-09-19",
  "2009-07-17",
  "2009-04-14"
];

export const MAX_APPEND_BLOB_BLOCK_SIZE = 100 * 1024 * 1024; // 100MB
export const MAX_APPEND_BLOB_BLOCK_COUNT = 50000;

// Validate audience, accept following audience patterns
// https://storage.azure.com
// https://storage.azure.com/
// e406a681-f3d4-42a8-90b6-c2b029497af1
// https://*.blob.core.windows.net
// https://*.blob.core.windows.net/
// https://*.blob.core.chinacloudapi.cn
// https://*.blob.core.chinacloudapi.cn/
// https://*.blob.core.usgovcloudapi.net
// https://*.blob.core.usgovcloudapi.net/
// https://*.blob.core.cloudapi.de
// https://*.blob.core.cloudapi.de/
export const VALID_BLOB_AUDIENCES = [
  /^https:\/\/storage\.azure\.com[\/]?$/,
  /^e406a681-f3d4-42a8-90b6-c2b029497af1$/,
  /^https:\/\/(.*)\.blob\.core\.windows\.net[\/]?$/,
  /^https:\/\/(.*)\.blob\.core\.chinacloudapi\.cn[\/]?$/,
  /^https:\/\/(.*)\.blob\.core\.usgovcloudapi\.net[\/]?$/,
  /^https:\/\/(.*)\.blob\.core\.cloudapi\.de[\/]?$/
];

export const HTTP_LINE_ENDING = "\r\n";
export const HTTP_HEADER_DELIMITER = ": ";

export const USERDELEGATIONKEY_BASIC_KEY = "I17GKLvcJUossaebtsEDZZ2RJ8GNLwLH4m7hRMxbVbkx6wNIRAABj4Rtw0FBhFuEAgmbL4gFMzUw+AStz9Sqdg==";

export const AUTHENTICATION_BEARERTOKEN_REQUIRED = "Only authentication scheme Bearer is supported";
