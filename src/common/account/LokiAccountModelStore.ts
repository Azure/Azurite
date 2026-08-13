import { stat } from "fs";
import Loki from "lokijs";
import { rimrafAsync } from "../utils/utils";
import { AccountModel, normalizeAccountName } from "./AccountModel";
import IAccountModelStore from "./IAccountModelStore";

/**
 * LokiAccountModelStore manages account-level configuration using LokiJS.
 * This store supports multiple accounts, with each account having its own configuration.
 * 
 * The account name (key) is used as the unique identifier for each account.
 * This allows different accounts to have different settings, such as blob versioning.
 *
 * @export
 * @class LokiAccountModelStore
 */
export default class LokiAccountModelStore implements IAccountModelStore {
  private readonly db: Loki;
  private initialized: boolean = false;
  private closed: boolean = true;
  private readonly accountModelsFromArgs: Map<string, AccountModel> | undefined;

  private readonly ACCOUNT_MODEL_COLLECTION = "$ACCOUNT_MODEL_COLLECTION$";

  /**
   * Creates an instance of LokiAccountDataStore.
   * 
   * @param {string} lokiDBPath - Path to the LokiJS database file
   * @param {boolean} inMemory - Whether to use in-memory persistence
   * @param {Map<string, AccountModel>} [accountModels] - Optional map of account configurations from environment
   * @memberof LokiAccountDataStore
   */
  public constructor(
    public readonly lokiDBPath: string,
    private readonly inMemory: boolean,
    accountModels?: Map<string, AccountModel>
  ) {
    this.accountModelsFromArgs = accountModels;
    this.db = new Loki(
      lokiDBPath,
      inMemory
        ? {
            persistenceMethod: "memory"
          }
        : {
            persistenceMethod: "fs",
            autosave: true,
            autosaveInterval: 5000
          }
    );
  }

  /**
   * Checks if the store is initialized.
   * 
   * @returns {boolean}
   * @memberof LokiAccountDataStore
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Checks if the store is closed.
   * 
   * @returns {boolean}
   * @memberof LokiAccountDataStore
   */
  public isClosed(): boolean {
    return this.closed;
  }

  public async clean(): Promise<void> {
    if (this.isClosed()) {
      if (!this.inMemory) {
        await rimrafAsync(this.lokiDBPath);
      }

      return;
    }
    throw new Error(`Cannot clean LokiBlobMetadataStore, it's not closed.`);
  }
  
  /**
   * Initializes the account data store.
   * Creates the account model collection if it doesn't exist.
   * Processes account models from environment arguments and merges them with existing DB configuration.
   * 
   * Configuration Merge Logic:
   * - For each account in accountModelsFromArgs:
   *   1. Load existing account configuration from database
   *   2. If account exists in DB, compare with new configuration
   *   3. If no conflicts detected, merge and update with new configuration
   *   4. If conflicts detected, throw error
   *   5. If account doesn't exist in DB, insert new configuration
   * 
   * Conflict Detection:
   * - Currently, isBlobVersioningEnabled does NOT cause conflicts as it can be toggled on/off safely
   * - Future account properties might require conflict detection if they cannot be changed after data exists
   * - Example conflict scenario: If property "storageRedundancy" was added and changed from "LRS" to "GRS"
   *   after data was written, this would be a conflict requiring data migration
   * 
   * @returns {Promise<void>}
   * @memberof LokiAccountDataStore
   */
  public async init(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      stat(this.lokiDBPath, (statError, stats) => {
        if (!statError) {
          this.db.loadDatabase({}, (dbError) => {
            if (dbError) {
              reject(dbError);
            } else {
              resolve();
            }
          });
        } else if (statError.code === "ENOENT") {
          resolve();
        } else {
          reject(statError);
        }
      });
    });

    // Create account model collection if not exists
    let accountModelCollection = this.db.getCollection<AccountModel>(
      this.ACCOUNT_MODEL_COLLECTION
    );

    if (accountModelCollection === null) {
      accountModelCollection = this.db.addCollection(
        this.ACCOUNT_MODEL_COLLECTION,
        {
          unique: ["key"]
        }
      );
    }

    const normalizedAccounts = new Map<string, AccountModel>();
    const persistedAccounts = accountModelCollection.find();
    for (const accountModel of persistedAccounts) {
      const key = normalizeAccountName(accountModel.key);
      if (normalizedAccounts.has(key)) {
        throw new Error(
          `Account model configuration contains duplicate account '${key}'.`
        );
      }
      normalizedAccounts.set(key, accountModel);
    }
    for (const accountModel of persistedAccounts) {
      const key = normalizeAccountName(accountModel.key);
      if (accountModel.key !== key) {
        accountModel.key = key;
        accountModelCollection.update(accountModel);
      }
    }

    // Process account models from environment arguments
    if (this.accountModelsFromArgs && this.accountModelsFromArgs.size > 0) {
      for (const [accountName, newAccountModel] of this.accountModelsFromArgs) {
        const normalizedAccountName = normalizeAccountName(accountName);
        const existingAccount = accountModelCollection.by(
          "key",
          normalizedAccountName
        );

        if (existingAccount) {
          // Account exists in DB - compare and merge configurations
          
          // TODO: Add conflict detection here for future account properties that cannot be changed
          // Example: if (existingAccount.storageRedundancy !== newAccountModel.storageRedundancy) {
          //   throw new Error(`Conflict: Cannot change storageRedundancy for account '${accountName}'`);
          // }
          
          // For now, isBlobVersioningEnabled can be toggled without conflicts
          // Simply update the existing account with new configuration
          existingAccount.isBlobVersioningEnabled = newAccountModel.isBlobVersioningEnabled;
          accountModelCollection.update(existingAccount);
        } else {
          // Account doesn't exist in DB - insert new configuration
          accountModelCollection.insert({
            key: normalizedAccountName,
            isBlobVersioningEnabled: newAccountModel.isBlobVersioningEnabled
          });
        }
      }
    }

    await new Promise<void>((resolve, reject) => {
      this.db.saveDatabase((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    this.initialized = true;
    this.closed = false;
  }

  /**
   * Closes the LokiJS database.
   * 
   * @returns {Promise<void>}
   * @memberof LokiAccountDataStore
   */
  public async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.closed = true;
          resolve();
        }
      });
    });
  }

  /**
   * Gets the account model for a specific account.
   * Returns undefined if the account doesn't exist.
   * 
   * @param {string} accountName - The name of the account (used as the key)
   * @returns {(AccountModel | undefined)}
   * @memberof LokiAccountDataStore
   */
  public getAccountModel(accountName: string): AccountModel | undefined {
    const accountModelCollection = this.db.getCollection<AccountModel>(
      this.ACCOUNT_MODEL_COLLECTION
    );

    if (accountModelCollection === null) {
      throw new Error("Account model collection is not initialized.");
    }

    return accountModelCollection.by("key", normalizeAccountName(accountName));
  }

  /**
   * Checks if blob versioning is enabled for a specific account.
   * Returns false if the account doesn't exist.
   * 
   * @param {string} accountName - The name of the account
   * @returns {boolean}
   * @memberof LokiAccountModelStore
   */
  public isBlobVersioningEnabled(accountName: string): boolean {
    const accountModel = this.getAccountModel(accountName);
    return accountModel?.isBlobVersioningEnabled ?? false;
  }

  public hasBlobVersioningEnabled(): boolean {
    if (!this.initialized) {
      return (
        this.accountModelsFromArgs !== undefined &&
        [...this.accountModelsFromArgs.values()].some(
          (account) => account.isBlobVersioningEnabled
        )
      );
    }

    const accountModelCollection = this.db.getCollection<AccountModel>(
      this.ACCOUNT_MODEL_COLLECTION
    );
    return (
      accountModelCollection !== null &&
      accountModelCollection
        .find()
        .some((account) => account.isBlobVersioningEnabled)
    );
  }
}
