export const DEFAULT_SERVER_HOST_NAME = "0.0.0.0"; // Change to 0.0.0.0 when needs external access

export const DEFAULT_SERVER_LISTENING_PORT = 10000;

export const DEFAULT_LOKI_DB_PATH = "__azurite_db_blob__.json";

export const DEFAULT_BLOB_PERSISTENCE_PATH = "__blobstorage__";

export const DEFAULT_DEBUG_LOG_PATH = "./debug.log";

export const DEFAULT_ENABLE_DEBUG_LOG = true;

export const DEFAULT_ACCESS_LOG_PATH = "./access.log";

export const DEFAULT_ENABLE_ACCESS_LOG = true;

export const DEFAULT_CONTEXT_PATH = "azurite_blob_context";

export const IS_PRODUCTION = process.env.NODE_ENV === "production";

export const LOGGER_CONFIGS = {};

export const API_VERSION = "2018-03-28";
