import { IAccountModel } from "./account/AccountModel";

/**
 * Implemented by every Azurite entry point's environment, so that account (management
 * plane) configuration is read the same way whether Azurite is started as `azurite`,
 * `azurite-blob`, or from the VS Code extension.
 *
 * @export
 * @interface IAccountModelEnvironment
 */
export default interface IAccountModelEnvironment {
  /**
   * Account configuration supplied at start up, or undefined when none was given, in which
   * case the configuration persisted by the previous run is used.
   *
   * @returns {Promise<IAccountModel | undefined>}
   * @memberof IAccountModelEnvironment
   */
  accountModel(): Promise<IAccountModel | undefined>;
}
