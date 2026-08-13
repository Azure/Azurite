import { stat } from "fs";
import Loki from "lokijs";

import ILogger from "../ILogger";
import { rimrafAsync } from "../utils/utils";
import {
  DEFAULT_ACCOUNT_BLOB_SERVICE_CONFIG,
  IAccountBlobServiceConfig,
  IAccountConfig
} from "./AccountModel";
import IAccountModelStore from "./IAccountModelStore";

/**
 * Loki backed implementation of IAccountModelStore, with its own database file so that the
 * blob, queue and table services can share one account configuration.
 *
 * @export
 * @class LokiAccountModelStore
 * @implements {IAccountModelStore}
 */
export default class LokiAccountModelStore implements IAccountModelStore {
  private readonly db: Loki;

  private initialized: boolean = false;
  private closed: boolean = true;

  private readonly ACCOUNTS_COLLECTION = "$ACCOUNTS_COLLECTION$";

  /**
   * Configuration in effect for this run, resolved during init().
   */
  private configs: Map<string, IAccountConfig> = new Map();

  public constructor(
    public readonly lokiDBPath: string,
    inMemory: boolean,
    private readonly incoming: IAccountConfig[] = [],
    private readonly logger?: ILogger
  ) {
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

  public isInitialized(): boolean {
    return this.initialized;
  }

  public isClosed(): boolean {
    return this.closed;
  }

  public async init(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      stat(this.lokiDBPath, (statError) => {
        if (!statError) {
          this.db.loadDatabase({}, (dbError) => {
            if (dbError) {
              reject(dbError);
            } else {
              resolve();
            }
          });
        } else {
          // when the DB file doesn't exist, ignore the error because the following will
          // re-create the file
          resolve();
        }
      });
    });

    if (this.db.getCollection(this.ACCOUNTS_COLLECTION) === null) {
      this.db.addCollection(this.ACCOUNTS_COLLECTION, {
        unique: ["name"]
      });
    }

    await this.resolve(this.incoming);

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

  public async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    this.closed = true;
  }

  public async clean(): Promise<void> {
    if (this.isClosed()) {
      await rimrafAsync(this.lokiDBPath);
      return;
    }
    throw new Error(`Cannot clean LokiAccountModelStore, it's not closed.`);
  }

  public async resolve(incoming: IAccountConfig[]): Promise<void> {
    const coll = this.db.getCollection(this.ACCOUNTS_COLLECTION);

    const resolved = new Map<string, IAccountConfig>();
    for (const doc of coll.find({}) as any[]) {
      resolved.set(doc.name, {
        name: doc.name,
        blobService: { ...doc.blobService }
      });
    }

    // Every setting can currently be changed against an existing workspace. Blob
    // versioning is safe to toggle: verified against the real service, turning it off
    // keeps existing versions listed, readable and deletable by version ID, and turning it
    // on captures a pre-existing blob's state as a version when it is next modified.
    //
    // A future setting that needs a migration rather than a merge would have to be
    // compared against `previous` here and rejected.
    for (const account of incoming) {
      const previous = resolved.get(account.name);

      resolved.set(account.name, account);

      if (previous === undefined) {
        coll.insert({ name: account.name, blobService: account.blobService });
      } else {
        const doc = coll.findOne({ name: account.name });
        if (doc !== null && doc !== undefined) {
          doc.blobService = account.blobService;
          coll.update(doc);
        }
      }
    }

    this.configs = resolved;

    // Print the resolved configuration so that Azurite issue reports include the account
    // settings that were actually in effect.
    if (this.logger !== undefined) {
      if (resolved.size === 0) {
        this.logger.debug(
          `LokiAccountModelStore:resolve() No account level configuration supplied or persisted, using defaults (blob versioning disabled).`
        );
      } else {
        this.logger.debug(
          `LokiAccountModelStore:resolve() Account level configuration in effect: ${JSON.stringify(
            [...resolved.values()]
          )}`
        );
      }
    }
  }

  public getBlobServiceConfig(account: string): IAccountBlobServiceConfig {
    const config = this.configs.get(account.toLowerCase());
    return config === undefined
      ? DEFAULT_ACCOUNT_BLOB_SERVICE_CONFIG
      : config.blobService;
  }

  public listConfigs(): IAccountConfig[] {
    return [...this.configs.values()];
  }
}
