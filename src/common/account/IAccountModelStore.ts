import ICleaner from "../ICleaner";
import IDataStore from "../IDataStore";
import { IAccountBlobServiceConfig, IAccountConfig } from "./AccountModel";

/**
 * Persistence for account (management plane) configuration.
 *
 * Azure Storage keeps account level settings such as blob versioning on the ARM
 * management plane, which Azurite does not emulate. Azurite instead takes the settings at
 * start up and persists them alongside the workspace, so that a run without the options
 * behaves the same as the previous run - just as the ARM setting persists on a real
 * account until it is changed.
 *
 * This lives outside the blob service because the settings are per account rather than per
 * service: queue and table can read the same store when they need account level settings,
 * without the blob service owning the data.
 *
 * @export
 * @interface IAccountModelStore
 */
export default interface IAccountModelStore extends IDataStore, ICleaner {
  /**
   * Reconcile the configuration supplied at start up with the configuration persisted by
   * the previous run, and persist the result.
   *
   * Called once during init(). Every setting can currently be changed against an existing
   * workspace, so this does not reject; a future setting needing a migration rather than a
   * merge would be compared here.
   *
   * @param {IAccountConfig[]} incoming Configuration supplied at start up, may be empty
   * @returns {Promise<void>}
   * @memberof IAccountModelStore
   */
  resolve(incoming: IAccountConfig[]): Promise<void>;

  /**
   * Blob service configuration in effect for an account, falling back to the defaults when
   * the account has no configuration. Account names are matched case insensitively.
   *
   * @param {string} account
   * @returns {IAccountBlobServiceConfig}
   * @memberof IAccountModelStore
   */
  getBlobServiceConfig(account: string): IAccountBlobServiceConfig;

  /**
   * Every account configuration in effect, for diagnostics.
   *
   * @returns {IAccountConfig[]}
   * @memberof IAccountModelStore
   */
  listConfigs(): IAccountConfig[];
}
