export const AZURITE_ACCOUNTS_ENV = "AZURITE_ACCOUNTS"; // Customize account name and keys by env
export const DEFAULT_ACCOUNTS_REFRESH_INTERVAL = 60 * 1000; // 60s
export const DEFAULT_FD_CACHE_NUMBER = 100;
export const FD_CACHE_NUMBER_MIN = 1;
export const FD_CACHE_NUMBER_MAX = 100;
export const DEFAULT_MAX_EXTENT_SIZE = 64 * 1024 * 1024; // 64 MB
export const DEFAULT_READ_CONCURRENCY = 100;
export const DEFAULT_EXTENT_GC_PROTECT_TIME_IN_MS = 10 * 60 * 1000; // 10mins
export const DEFAULT_SQL_CHARSET = "utf8mb4";
// IP regex.
// This is to distinguish IP style hostname from others
// When host matches it, we assume user is accessing emulator by IP address.
// Otherwise, try to extract string before first dot, as account name.
export const IP_REGEX = new RegExp("^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$");
// No Account Host Names.
// This is to distinguish hostnames that will not contain the account name
// When host matches it, we assume user is accessing emulator by the host name.
// Otherwise, try to extract string before first dot, as account name.
export const NO_ACCOUNT_HOST_NAMES = new Set().add("host.docker.internal");

// Use utf8mb4_bin instead of utf8mb4_general_ci to honor case-sensitive
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

export const BEARER_TOKEN_PREFIX = "Bearer";
export const HTTPS = "https";

// Validate issuer
// Only check prefix and bypass AAD tenant ID match
// BlackForest: https://sts.microsoftonline.de/
// Fairfax: https://sts.windows.net/
// Mooncake: https://sts.chinacloudapi.cn/
// Production: https://sts.windows.net/
// Test: https://sts.windows-ppe.net/
export const VALID_ISSUE_PREFIXES = [
  "https://sts.windows.net/",
  "https://sts.microsoftonline.de/",
  "https://sts.chinacloudapi.cn/",
  "https://sts.windows-ppe.net"
];

export const EMULATOR_ACCOUNT_NAME = "devstoreaccount1";
export const EMULATOR_ACCOUNT_KEY = Buffer.from(
  "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
  "base64"
);

export const VALID_CSHARP_IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
