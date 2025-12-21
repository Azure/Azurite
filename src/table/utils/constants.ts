import { StoreDestinationArray } from "../../common/persistence/IExtentStore";

export const DEFAULT_TABLE_EXTENT_LOKI_DB_PATH =
  "__azurite_db_table_extent__.json";
export const DEFAULT_TABLE_LOKI_DB_PATH = "__azurite_db_table__.json";

export const DEFAULT_TABLE_SERVER_HOST_NAME = "127.0.0.1"; // Change to 0.0.0.0 when needs external access
export const DEFAULT_TABLE_LISTENING_PORT = 10002;
export const DEFAULT_TABLE_KEEP_ALIVE_TIMEOUT = 5;
export const DEFAULT_ENABLE_ACCESS_LOG = true;
export const DEFAULT_ENABLE_DEBUG_LOG = true;
export const DEFAULT_TABLE_PERSISTENCE_PATH = "__tablestorage__";
export const DEFAULT_KEY_MAX_LENGTH = 512;

export enum TABLE_STATUSCODE {
  CREATED = 201,
  NOCONTENT = 204
}

export const DEFAULT_TABLE_CONTEXT_PATH = "azurite_table_context";
export const TABLE_API_VERSION = "2025-11-05";
export const VERSION = "3.35.0";
// Max Body size is 4 MB
export const BODY_SIZE_MAX = 1024 * 1024 * 4;
// Max Entity size is 1 MB
export const ENTITY_SIZE_MAX = 1024 * 1024;

export const HeaderConstants = {
  SERVER: "Server",
  APPLICATION_JSON: "application/json",
  AUTHORIZATION: "authorization",
  CONTENT_MD5: "content-md5",
  CONTENT_TYPE: "content-type",
  CONTENT_LENGTH: "content-length",
  DATE: "date",
  X_MS_DATE: "x-ms-date",
  X_MS_VERSION: "x-ms-version",
  ACCEPT: "accept",
  PREFER: "Prefer",
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

export const SUPPORTED_QUERY_OPERATOR = ["eq", "gt", "ge", "lt", "le", "ne"];

export const NO_METADATA_ACCEPT = "application/json;odata=nometadata";
export const MINIMAL_METADATA_ACCEPT = "application/json;odata=minimalmetadata";
export const FULL_METADATA_ACCEPT = "application/json;odata=fullmetadata";
export const XML_METADATA = "application/atom+xml";
export const ODATA_TYPE = "@odata.type";

export const RETURN_NO_CONTENT = "return-no-content";
export const RETURN_CONTENT = "return-content";

export const DEFAULT_TABLE_PERSISTENCE_ARRAY: StoreDestinationArray = [
  {
    locationId: "Default",
    locationPath: DEFAULT_TABLE_PERSISTENCE_PATH,
    maxConcurrency: 1
  }
];

export const QUERY_RESULT_MAX_NUM = 1000;
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

export const TABLE_SERVICE_PERMISSION = "raud";

export const SECONDARY_SUFFIX = "-secondary";

// Validate audience, accept following audience patterns
// https://storage.azure.com
// https://storage.azure.com/
// e406a681-f3d4-42a8-90b6-c2b029497af1
// https://*.table.core.windows.net
// https://*.table.core.windows.net/
// https://*.table.core.chinacloudapi.cn
// https://*.table.core.chinacloudapi.cn/
// https://*.table.core.usgovcloudapi.net
// https://*.table.core.usgovcloudapi.net/
// https://*.table.core.cloudapi.de
// https://*.table.core.cloudapi.de/
export const VALID_TABLE_AUDIENCES = [
  /^https:\/\/storage\.azure\.com[\/]?$/,
  /^e406a681-f3d4-42a8-90b6-c2b029497af1$/,
  /^https:\/\/(.*)\.table\.core\.windows\.net[\/]?$/,
  /^https:\/\/(.*)\.table\.core\.chinacloudapi\.cn[\/]?$/,
  /^https:\/\/(.*)\.table\.core\.usgovcloudapi\.net[\/]?$/,
  /^https:\/\/(.*)\.table\.core\.cloudapi\.de[\/]?$/
];
