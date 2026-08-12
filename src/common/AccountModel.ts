/**
 * Azurite account (management plane) configuration model.
 *
 * Azure Storage exposes account level settings such as blob versioning through the
 * ARM management plane (Microsoft.Storage/storageAccounts/blobServices), NOT through
 * the data plane REST API that Azurite emulates. Azurite has no management plane, so
 * these settings are supplied at start up instead - either as a JSON file
 * (--accountConfigFile) or as an inline JSON string (--accountConfig).
 *
 * Keeping this model in `src/common` (rather than under `src/blob`) so queue and table
 * can reuse the same account configuration when they need account level settings.
 */

/**
 * Account level settings for the blob service.
 */
export interface IAccountBlobServiceConfig {
  /**
   * Whether blob versioning is enabled for the account.
   *
   * Equivalent to the ARM property
   * Microsoft.Storage/storageAccounts/blobServices/default#isVersioningEnabled
   */
  isVersioningEnabled: boolean;
}

/**
 * Configuration for a single storage account.
 */
export interface IAccountConfig {
  /**
   * Storage account name, for example "devstoreaccount1".
   */
  name: string;

  blobService: IAccountBlobServiceConfig;
}

/**
 * Root of the account configuration document.
 */
export interface IAccountModel {
  accounts: IAccountConfig[];
}

export const DEFAULT_ACCOUNT_BLOB_SERVICE_CONFIG: IAccountBlobServiceConfig = {
  isVersioningEnabled: false
};

/**
 * Thrown when the supplied account configuration cannot be used. Surfaced to the user
 * as a start up failure rather than a request failure.
 */
export class AccountConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AccountConfigError";
  }
}

/**
 * Parse and validate an account configuration document.
 *
 * Accepts either the full document shape:
 *   { "accounts": [ { "name": "devstoreaccount1",
 *                     "blobService": { "isVersioningEnabled": true } } ] }
 *
 * or the shorthand where a single account object is supplied directly:
 *   { "name": "devstoreaccount1", "blobService": { "isVersioningEnabled": true } }
 *
 * @param raw JSON text
 * @param source Description of where the JSON came from, used in error messages
 */
export function parseAccountModel(raw: string, source: string): IAccountModel {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new AccountConfigError(
      `Account configuration from ${source} is not valid JSON: ${
        (err as Error).message
      }`
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AccountConfigError(
      `Account configuration from ${source} must be a JSON object.`
    );
  }

  const rawAccounts = parsed.accounts !== undefined ? parsed.accounts : [parsed];

  if (!Array.isArray(rawAccounts)) {
    throw new AccountConfigError(
      `Account configuration from ${source} must have an "accounts" array.`
    );
  }

  if (rawAccounts.length === 0) {
    throw new AccountConfigError(
      `Account configuration from ${source} must configure at least one account.`
    );
  }

  const accounts: IAccountConfig[] = [];
  const seen = new Set<string>();

  for (const rawAccount of rawAccounts) {
    if (
      rawAccount === null ||
      typeof rawAccount !== "object" ||
      Array.isArray(rawAccount)
    ) {
      throw new AccountConfigError(
        `Account configuration from ${source} contains an account entry that is not a JSON object.`
      );
    }

    if (typeof rawAccount.name !== "string" || rawAccount.name === "") {
      throw new AccountConfigError(
        `Account configuration from ${source} contains an account without a non-empty "name".`
      );
    }

    // Account names are case insensitive in Azure Storage, and Azurite resolves them
    // in lower case, so normalize here to keep lookups predictable.
    const name = rawAccount.name.toLowerCase();

    if (seen.has(name)) {
      throw new AccountConfigError(
        `Account configuration from ${source} configures account "${name}" more than once.`
      );
    }
    seen.add(name);

    const blobService = rawAccount.blobService ?? {};
    if (
      blobService === null ||
      typeof blobService !== "object" ||
      Array.isArray(blobService)
    ) {
      throw new AccountConfigError(
        `Account "${name}" has a "blobService" value that is not a JSON object.`
      );
    }

    const isVersioningEnabled =
      blobService.isVersioningEnabled ??
      DEFAULT_ACCOUNT_BLOB_SERVICE_CONFIG.isVersioningEnabled;

    if (typeof isVersioningEnabled !== "boolean") {
      throw new AccountConfigError(
        `Account "${name}" has a non-boolean "blobService.isVersioningEnabled" value.`
      );
    }

    accounts.push({ name, blobService: { isVersioningEnabled } });
  }

  return { accounts };
}

/**
 * Look up the blob service configuration for an account, falling back to the
 * defaults when the account is not configured.
 */
export function getAccountBlobServiceConfig(
  model: IAccountModel | undefined,
  account: string
): IAccountBlobServiceConfig {
  if (model === undefined) {
    return DEFAULT_ACCOUNT_BLOB_SERVICE_CONFIG;
  }

  const match = model.accounts.find(
    (candidate) => candidate.name === account.toLowerCase()
  );

  return match === undefined
    ? DEFAULT_ACCOUNT_BLOB_SERVICE_CONFIG
    : match.blobService;
}
