import { readFileSync } from 'fs';
import { AccountModel } from '../blob/AccountModel';

export function parseAccountModelFlags(flags: {
  [key: string]: any;
}): AccountModel | undefined {
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

  let json: string | undefined = configAsJson;
  if (configFilePath)
  {
    json = readFileSync(configFilePath, "utf-8");
  }

  if (!json)
  {
    throw new Error("Account configuration was specified but, but it is empty");
  }

  const parsed = JSON.parse(json);

  if (!parsed) {
    throw new Error("Account configuration is invalid");
  }

  if (parsed.isBlobVersioningEnabled === undefined || 
      parsed.isBlobVersioningEnabled === null || 
      typeof parsed.isBlobVersioningEnabled !== "boolean") {
      throw new Error("Account configuration value: isBlobVersioningEnabled must be a boolean");
  }

  const accountModel: AccountModel =
  {
    key: "account",
    isBlobVersioningEnabled: parsed.isBlobVersioningEnabled
  }

  return accountModel;
}
