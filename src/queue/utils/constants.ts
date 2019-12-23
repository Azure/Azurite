import { StoreDestinationArray } from "../../common/persistence/IExtentStore";

export const VERSION = "3.3.0-preview";
export const QUEUE_API_VERSION = "2019-02-02";
export const DEFAULT_QUEUE_SERVER_HOST_NAME = "127.0.0.1"; // Change to 0.0.0.0 when needs external access
export const DEFAULT_QUEUE_LISTENING_PORT = 10001;
export const IS_PRODUCTION = process.env.NODE_ENV === "production";
export const DEFAULT_QUEUE_LOKI_DB_PATH = "__azurite_db_queue__.json";
export const DEFAULT_QUEUE_EXTENT_LOKI_DB_PATH =
  "__azurite_db_queue_extent__.json";
export const DEFAULT_QUEUE_PERSISTENCE_PATH = "__queuestorage__";
export const DEFAULT_DEBUG_LOG_PATH = "./debug.log";
export const DEFAULT_ENABLE_DEBUG_LOG = true;
export const DEFAULT_ACCESS_LOG_PATH = "./access.log";
export const DEFAULT_ENABLE_ACCESS_LOG = true;
export const DEFAULT_QUEUE_CONTEXT_PATH = "azurite_queue_context";
export const LOGGER_CONFIGS = {};
export const DEFAULT_GC_INTERVAL_MS = 60 * 1000;
export const EMULATOR_ACCOUNT_NAME = "devstoreaccount1";
export const EMULATOR_ACCOUNT_KEY = Buffer.from(
  "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
  "base64"
);
export const NEVER_EXPIRE_DATE = new Date("9999-12-31T23:59:59.999Z");
export const QUEUE_SERVICE_PERMISSION = "raup";
export const LIST_QUEUE_MAXRESSULTS_MIN = 1;
export const LIST_QUEUE_MAXRESSULTS_MAX = 2147483647;
export const DEFUALT_DEQUEUE_VISIBILITYTIMEOUT = 30; // 30s as default.
export const DEQUEUE_VISIBILITYTIMEOUT_MIN = 1;
export const DEQUEUE_VISIBILITYTIMEOUT_MAX = 604800;
export const DEQUEUE_NUMOFMESSAGES_MIN = 1;
export const DEQUEUE_NUMOFMESSAGES_MAX = 32;
export const MESSAGETEXT_LENGTH_MAX = 65536;
export const DEFUALT_MESSAGETTL = 604800; // 604800s (7 day) as default.
export const ENQUEUE_VISIBILITYTIMEOUT_MIN = 0;
export const ENQUEUE_VISIBILITYTIMEOUT_MAX = 604800;
export const MESSAGETTL_MIN = 1;
export const DEFUALT_UPDATE_VISIBILITYTIMEOUT = 30; // 30s as default.
export const UPDATE_VISIBILITYTIMEOUT_MIN = 0;
export const UPDATE_VISIBILITYTIMEOUT_MAX = 604800;

export const EMPTY_EXTENT_CHUNK = { id: "", offset: 0, count: 0 };

export const MethodConstants = {
  OPTIONS: "OPTIONS"
};

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
  ACCESS_CONTROL_EXPOSE_HEADERS: "Access-Control-Expose-Headers",
  ACCESS_CONTROL_ALLOW_ORIGIN: "Access-Control-Allow-Origin",
  ACCESS_CONTROL_ALLOW_CREDENTIALS: "Access-Control-Allow-Credentials",
  ACCESS_CONTROL_ALLOW_METHODS: "Access-Control-Allow-Methods",
  ACCESS_CONTROL_ALLOW_HEADERS: "Access-Control-Allow-Headers",
  ACCESS_CONTROL_MAX_AGE: "Access-Control-Max-Age",
  ACCESS_CONTROL_REQUEST_METHOD: "access-control-request-method",
  ACCESS_CONTROL_REQUEST_HEADERS: "access-control-request-headers",
  X_MS_VERSION: "x-ms-version"
};

export const SECONDARY_SUFFIX = "-secondary";

export enum QUEUE_STATUSCODE {
  CREATED = 201,
  NOCONTENT = 204
}

export const DEFAULT_QUEUE_PERSISTENCE_ARRAY: StoreDestinationArray = [
  {
    locationId: "Default",
    locationPath: DEFAULT_QUEUE_PERSISTENCE_PATH,
    maxConcurrency: 1
  }
];

export const ValidAPIVersions = [
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
