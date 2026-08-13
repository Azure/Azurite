import { readFileSync, existsSync } from 'fs';
import {
  AccountModel,
  normalizeAccountName
} from './account/AccountModel';
import { EMULATOR_ACCOUNT_NAME } from './utils/constants';

/**
 * Parses account model flags and returns a map of account models.
 * 
 * Supports multiple formats:
 * 1. Multi-account with paths: "accountName1:/path/to/config1.json,accountName2:/path/to/config2.json"
 * 2. Multi-account with JSON: "accountName1:{\"isBlobVersioningEnabled\":true},accountName2:{\"isBlobVersioningEnabled\":false}"
 * 3. Single account path (backward compatible): "/path/to/config.json" - uses default emulator account name
 * 4. Single account JSON (backward compatible): "{\"isBlobVersioningEnabled\":true}" - uses default emulator account name
 * 
 * @param flags - Configuration flags object
 * @returns Map of account name to AccountModel, or undefined if no configuration is provided
 */
export function parseAccountModelFlags(flags: {
  [key: string]: any;
}): Map<string, AccountModel> | undefined {
  const configFilePath = flags?.accountConfigFilePath;
  const configAsJson = flags?.accountConfigAsJson;

  if (!configFilePath && !configAsJson) {
    // If neither is specified, return undefined
    return undefined;
  }

  if (configFilePath && configAsJson) {
    // If both are specified, throw an error
    throw new Error("Specify either accountConfigFilePath or accountConfigAsJson, not both.");
  }

  // First, split entries to count them
  const configString = configFilePath || configAsJson!;
  const entries = splitAccountEntries(configString);
  
  if (entries.length === 0) {
    throw new Error("Account configuration was specified but no valid accounts were found");
  }

  const accountModels = new Map<string, AccountModel>();

  if (configFilePath) {
    // Check if this is single-account mode (no colon prefix) or multi-account mode
    if (
      entries.length === 1 &&
      (!entries[0].includes(":") || /^[a-zA-Z]:[\\/]/.test(entries[0]))
    ) {
      // Single account mode: just a path without account name prefix
      parseSingleAccountConfigFromPath(entries[0], accountModels);
    } else {
      // Multi-account mode: "accountName1:/path/to/config1.json,accountName2:/path/to/config2.json"
      parseAccountConfigFromPaths(entries, accountModels);
    }
  } else if (configAsJson) {
    // Check if this is single-account mode (starts with '{') or multi-account mode
    if (entries.length === 1 && entries[0].trim().startsWith('{')) {
      // Single account mode: just JSON without account name prefix
      parseSingleAccountConfigFromJson(entries[0], accountModels);
    } else {
      // Multi-account mode: "accountName1:{...},accountName2:{...}"
      parseAccountConfigFromJson(entries, accountModels);
    }
  }

  return accountModels;
}

/**
 * Parses a single account configuration from a file path (backward compatible mode).
 * Format: "/path/to/config.json" - uses default emulator account name
 */
function parseSingleAccountConfigFromPath(
  filePath: string,
  accountModels: Map<string, AccountModel>
): void {
  const trimmedPath = filePath.trim();
  
  if (!existsSync(trimmedPath)) {
    throw new Error(`Account configuration file not found: ${trimmedPath}`);
  }

  let json: string;
  try {
    json = readFileSync(trimmedPath, "utf-8");
  } catch (error) {
    throw new Error(`Failed to read account configuration file: ${error}`, {
      cause: error
    });
  }

  if (!json || json.trim() === "") {
    throw new Error(`Account configuration file is empty: ${trimmedPath}`);
  }

  const accountModel = parseAccountModelJson(EMULATOR_ACCOUNT_NAME, json);
  addAccountModel(accountModels, accountModel);
}

/**
 * Parses a single account configuration from a JSON string (backward compatible mode).
 * Format: "{\"isBlobVersioningEnabled\":true}" - uses default emulator account name
 */
function parseSingleAccountConfigFromJson(
  jsonString: string,
  accountModels: Map<string, AccountModel>
): void {
  const trimmedJson = jsonString.trim();
  
  if (!trimmedJson) {
    throw new Error("Account configuration JSON is empty");
  }

  const accountModel = parseAccountModelJson(EMULATOR_ACCOUNT_NAME, trimmedJson);
  addAccountModel(accountModels, accountModel);
}

/**
 * Parses account configuration from file paths.
 * Format: "accountName1:/path/to/config1.json,accountName2:/path/to/config2.json"
 */
function parseAccountConfigFromPaths(
  entries: string[],
  accountModels: Map<string, AccountModel>
): void {
  for (const entry of entries) {
    const { accountName, value } = parseAccountEntry(entry);

    if (!existsSync(value)) {
      throw new Error(`Account configuration file not found for account '${accountName}': ${value}`);
    }

    let json: string;
    try {
      json = readFileSync(value, "utf-8");
    } catch (error) {
      throw new Error(
        `Failed to read account configuration file for account '${accountName}': ${error}`,
        { cause: error }
      );
    }

    if (!json || json.trim() === "") {
      throw new Error(`Account configuration file is empty for account '${accountName}': ${value}`);
    }

    const accountModel = parseAccountModelJson(accountName, json);
    addAccountModel(accountModels, accountModel);
  }
}

/**
 * Parses account configuration from JSON strings.
 * Format: "accountName1:{\"isBlobVersioningEnabled\":true},accountName2:{\"isBlobVersioningEnabled\":false}"
 */
function parseAccountConfigFromJson(
  entries: string[],
  accountModels: Map<string, AccountModel>
): void {
  for (const entry of entries) {
    const { accountName, value } = parseAccountEntry(entry);

    if (!value || value.trim() === "") {
      throw new Error(`Account configuration is empty for account '${accountName}'`);
    }

    const accountModel = parseAccountModelJson(accountName, value);
    addAccountModel(accountModels, accountModel);
  }
}

/**
 * Splits the configuration string into individual account entries.
 * Handles commas that might be inside JSON objects.
 */
function splitAccountEntries(config: string): string[] {
  const entries: string[] = [];
  let currentEntry = "";
  let braceDepth = 0;
  let inQuotes = false;

  for (let i = 0; i < config.length; i++) {
    const char = config[i];
    const prevChar = i > 0 ? config[i - 1] : "";

    if (char === '"' && prevChar !== '\\') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (char === '{') {
        braceDepth++;
      } else if (char === '}') {
        braceDepth--;
      } else if (char === ',' && braceDepth === 0) {
        // This comma is a separator between accounts
        if (currentEntry.trim()) {
          entries.push(currentEntry.trim());
        }
        currentEntry = "";
        continue;
      }
    }

    currentEntry += char;
  }

  // Add the last entry
  if (currentEntry.trim()) {
    entries.push(currentEntry.trim());
  }

  return entries;
}

/**
 * Parses a single account entry in the format "accountName:value"
 */
function parseAccountEntry(entry: string): { accountName: string; value: string } {
  const colonIndex = entry.indexOf(':');
  
  if (colonIndex === -1) {
    throw new Error(`Invalid account configuration format. Expected 'accountName:value', got: ${entry}`);
  }

  const accountName = normalizeAccountName(
    entry.substring(0, colonIndex)
  );
  const value = entry.substring(colonIndex + 1).trim();

  if (!accountName) {
    throw new Error(`Account name is missing in configuration entry: ${entry}`);
  }

  if (!value) {
    throw new Error(`Configuration value is missing for account '${accountName}'`);
  }

  return { accountName, value };
}

/**
 * Parses JSON string into an AccountModel.
 */
function parseAccountModelJson(accountName: string, json: string): AccountModel {
  let parsed: any;
  
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(
      `Invalid JSON in account configuration for account '${accountName}': ${error}`,
      { cause: error }
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Account configuration must be a JSON object for account '${accountName}'`);
  }

  const isBlobVersioningEnabled =
    parsed.isBlobVersioningEnabled === undefined
      ? false
      : parsed.isBlobVersioningEnabled;

  if (typeof isBlobVersioningEnabled !== "boolean") {
    throw new Error(`Account configuration value 'isBlobVersioningEnabled' must be a boolean for account '${accountName}'`);
  }

  const accountModel: AccountModel = {
    key: normalizeAccountName(accountName),
    isBlobVersioningEnabled
  };

  return accountModel;
}

function addAccountModel(
  accountModels: Map<string, AccountModel>,
  accountModel: AccountModel
): void {
  const accountName = normalizeAccountName(accountModel.key);
  if (accountModels.has(accountName)) {
    throw new Error(
      `Account configuration contains duplicate account '${accountName}'`
    );
  }

  accountModels.set(accountName, {
    ...accountModel,
    key: accountName
  });
}
