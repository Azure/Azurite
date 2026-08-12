import { readFile } from "fs-extra";

import {
  AccountConfigError,
  IAccountModel,
  parseAccountModel
} from "./AccountModel";

/**
 * Shared helpers for reading environment/command line options that are used by more
 * than one Azurite entry point (azurite, azurite-blob, and the VS Code extension).
 */

/**
 * Resolve the account (management plane) configuration from the --accountConfigFile
 * and --accountConfig options.
 *
 * The two options are mutually exclusive. When neither is supplied, undefined is
 * returned and Azurite falls back to the configuration persisted from the previous
 * run, or to the defaults when there is none.
 *
 * @param accountConfigFile Value of the --accountConfigFile option
 * @param accountConfig Value of the --accountConfig option
 */
export async function resolveAccountModel(
  accountConfigFile: string | undefined,
  accountConfig: string | undefined
): Promise<IAccountModel | undefined> {
  if (accountConfigFile !== undefined && accountConfig !== undefined) {
    throw new AccountConfigError(
      `The --accountConfigFile and --accountConfig options are mutually exclusive, please provide only one of them.`
    );
  }

  if (accountConfigFile !== undefined) {
    if (typeof accountConfigFile !== "string" || accountConfigFile === "") {
      throw new AccountConfigError(
        `Must provide a file path for the --accountConfigFile option.`
      );
    }

    let raw: string;
    try {
      raw = await readFile(accountConfigFile, "utf8");
    } catch (err) {
      throw new AccountConfigError(
        `Could not read the account configuration file "${accountConfigFile}": ${
          (err as Error).message
        }`
      );
    }

    return parseAccountModel(raw, `file "${accountConfigFile}"`);
  }

  if (accountConfig !== undefined) {
    if (typeof accountConfig !== "string" || accountConfig === "") {
      throw new AccountConfigError(
        `Must provide a JSON string for the --accountConfig option.`
      );
    }

    return parseAccountModel(accountConfig, "the --accountConfig option");
  }

  return undefined;
}
