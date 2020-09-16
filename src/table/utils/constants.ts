export const DEFAULT_TABLE_EXTENT_LOKI_DB_PATH =
  "__azurite_db_table_extent__.json";
export const DEFAULT_TABLE_LOKI_DB_PATH = "__azurite_db_table__.json";

export const DEFAULT_TABLE_SERVER_HOST_NAME = "127.0.0.1"; // Change to 0.0.0.0 when needs external access
export const DEFAULT_TABLE_LISTENING_PORT = 10002;
export const DEFAULT_ENABLE_ACCESS_LOG = true;
export const DEFAULT_ENABLE_DEBUG_LOG = true;

export enum TABLE_STATUSCODE {
  CREATED = 201,
  NOCONTENT = 204
}

export const DEFAULT_TABLE_CONTEXT_PATH = "azurite_table_context";
export const TABLE_API_VERSION = "2019-12-12";

export const HeaderConstants = {
  SERVER: "Server",
  VERSION: "3.8.0",
  X_MS_VERSION: "x-ms-version",
  APPLICATION_JSON: "application/json"
};

export const NO_METADATA_ACCEPT = "application/json;odata=nometadata";
export const MINIMAL_METADATA_ACCEPT = "application/json;odata=minimalmetadata";
export const FULL_METADATA_ACCEPT = "application/json;odata=fullmetadata";

export const RETURN_NO_CONTENT = "return-no-content";
export const RETURN_CONTENT = "return-content";

export const ValidAPIVersions = [
  "2019-12-12",
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
