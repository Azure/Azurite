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
  VERSION: "3.8.0"
};

export const NO_METADATA_ACCEPT = "application/json;odata=nometadata";
export const MINIMAL_METADATA_ACCEPT = "application/json;odata=minimalmetadata";
export const FULL_METADATA_ACCEPT = "application/json;odata=fullmetadata";

export const RETURN_NO_CONTENT = "return-no-content";
export const RETURN_CONTENT = "return-content";
