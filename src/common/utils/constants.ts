export const AZURITE_ACCOUNTS_ENV = "AZURITE_ACCOUNTS"; // Customize account name and keys by env
export const DEFAULT_ACCOUNTS_REFRESH_INTERVAL = 60 * 1000; // 60s
export const DEFAULT_FD_CACHE_NUMBER = 100;
export const FD_CACHE_NUMBER_MIN = 1;
export const FD_CACHE_NUMBER_MAX = 100;
export const DEFAULT_MAX_EXTENT_SIZE = 64 * 1024 * 1024; // 64 MB
export const DEFAULT_READ_CONCURRENCY = 100;
export const DEFAULT_EXTENT_GC_PROTECT_TIME_IN_MS = 10 * 60 * 1000; // 10mins
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
  charset: DEFAULT_SQL_CHARSET,
  collate: DEFAULT_SQL_COLLATE,
  dialectOptions: {
    timezone: "+00:00"
  }
};
