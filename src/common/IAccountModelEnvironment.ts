import { AccountModel } from "./account/AccountModel";

/**
 * Interface for environments that provide account-level configuration.
 * This allows different accounts to have different settings.
 *
 * @export
 * @interface IAccountModelEnvironment
 */
export default interface IAccountModelEnvironment {
  /**
   * Gets the account models configuration from environment flags.
   * Returns a map of account name to AccountModel, or undefined if no account configuration is provided.
   * 
   * @returns {(Map<string, AccountModel> | undefined)}
   * @memberof IAccountDataEnvironment
   */
  getAccountModels(): Map<string, AccountModel> | undefined;
}
