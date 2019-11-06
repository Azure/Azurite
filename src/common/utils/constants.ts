export const AZURITE_ACCOUNTS_ENV = "AZURITE_ACCOUNTS"; // Customize account name and keys by env
export const DEFAULT_ACCOUNTS_REFRESH_INTERVAL = 60 * 1000; // 60s
export const DEFAULT_GC_UNMODIFIED_TIME = 3600;
export const DEFAULT_FD_CACHE_NUMBER = 100;
export const FD_CACHE_NUMBER_MIN = 1;
export const FD_CACHE_NUMBER_MAX = 100;
export const DEFAULT_MAX_EXTENT_SIZE = 4 * 1024 * 1024;
export const DEFAULT_READ_CONCURRENCY = 100;
export const DEFAULT_SQL_OPTIONS = {
  logging: false,
  pool: {
    max: 100,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  dialectOptions: {
    timezone: "Etc/GMT-0"
  }
};
