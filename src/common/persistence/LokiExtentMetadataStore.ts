import { stat } from "fs";
import Loki from "lokijs";

import { rimrafAsync } from "../utils/utils";
import AllExtentsAsyncIterator from "./AllExtentsAsyncIterator";
import IExtentMetadataStore, { IExtentModel } from "./IExtentMetadataStore";

/**
 * This is a metadata source implementation for extent management based on loki DB.
 *
 * It contains following collection and documents:
 *
 * -- EXTENTS_COLLECTION     // Collections maintain extents information, including extentID, mapped local file path
 *                           // Unique document properties: id, path
 *
 * @export
 * @class LokiExtentMetadata
 * @implements {IExtentMetadata}
 */
export default class LokiExtentMetadata implements IExtentMetadataStore {
  private readonly db: Loki;

  private initialized: boolean = false;
  private closed: boolean = true;

  private readonly EXTENTS_COLLECTION = "$EXTENTS_COLLECTION$";

  public constructor(public readonly lokiDBPath: string, inMemory: boolean) {
    this.db = new Loki(lokiDBPath, inMemory ? {
      persistenceMethod: "memory"
    } : {
      persistenceMethod: "fs",
      autosave: true,
      autosaveInterval: 5000
    });
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public isClosed(): boolean {
    return this.closed;
  }

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
        } else {
          // when DB file doesn't exist, ignore the error because following will re-create the file
          resolve();
        }
      });
    });

    // Create EXTENTS_COLLECTION if not exists
    if (this.db.getCollection(this.EXTENTS_COLLECTION) === null) {
      this.db.addCollection(this.EXTENTS_COLLECTION, {
        indices: ["id"]
      });
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
   * Close loki DB.
   *
   * @returns {Promise<void>}
   * @memberof LokiBlobDataStore
   */
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

  /**
   * Clean LokiExtentMetadata.
   *
   * @returns {Promise<void>}
   * @memberof LokiExtentMetadata
   */
  public async clean(): Promise<void> {
    if (this.isClosed()) {
      await rimrafAsync(this.lokiDBPath);
      return;
    }
    throw new Error(`Cannot clean LokiExtentMetadata, it's not closed.`);
  }

  /**
   * Update the extent status in DB. A new item will be created if the extent does not exists.
   *
   * @param {IExtentModel} extent
   * @returns {Promise<void>}
   * @memberof LokiExtentMetadata
   */
  public async updateExtent(extent: IExtentModel): Promise<void> {
    const coll = this.db.getCollection(this.EXTENTS_COLLECTION);
    const doc = coll.findOne({ id: extent.id });

    if (!doc) {
      coll.insert(extent);
      return;
    }

    doc.size = extent.size;
    doc.LastModifyInMS = extent.lastModifiedInMS;
    coll.update(doc);
  }

  /**
   * List extents.
   *
   * @param {string} [id]
   * @param {number} [maxResults]
   * @param {number} [marker]
   * @param {Date} [queryTime]
   * @param {number} [protectTimeInMs]
   * @returns {(Promise<[IExtentModel[], number | undefined]>)}
   * @memberof LokiExtentMetadata
   */
  public async listExtents(
    id?: string,
    maxResults?: number,
    marker?: number,
    queryTime?: Date,
    protectTimeInMs?: number
  ): Promise<[IExtentModel[], number | undefined]> {
    const query: any = {};
    if (id !== undefined) {
      query.id = id;
    }
    if (maxResults === undefined) {
      maxResults = 5000;
    }

    if (protectTimeInMs === undefined) {
      protectTimeInMs = 0;
    }

    if (queryTime !== undefined) {
      query.LastModifyInMS = {
        $lt: queryTime.getTime() - protectTimeInMs
      };
    }

    query.$loki = { $gt: marker };

    const coll = this.db.getCollection(this.EXTENTS_COLLECTION);
    const docs = coll.chain().find(query).limit(maxResults).data();

    if (docs.length < maxResults) {
      return [docs, undefined];
    } else {
      const nextMarker = docs[docs.length - 1].$loki;
      return [docs, nextMarker];
    }
  }

  /**
   * Delete the extent metadata from DB with the extentId.
   *
   * @param {string} extentId
   * @returns {Promise<void>}
   * @memberof IExtentMetadata
   */
  public async deleteExtent(extentId: string): Promise<void> {
    const coll = this.db.getCollection(this.EXTENTS_COLLECTION);
    return coll.findAndRemove({ id: extentId });
  }

  public iteratorExtents(): AsyncIterator<string[]> {
    return new AllExtentsAsyncIterator(this);
  }

  /**
   * Get the persistencyId for a given extentId.
   *
   * @param {string} extentId
   * @returns {Promise<string>}
   * @memberof IExtentMetadata
   */
  public async getExtentLocationId(extentId: string): Promise<string> {
    const coll = this.db.getCollection(this.EXTENTS_COLLECTION);
    const doc = coll.findOne({ id: extentId }) as IExtentModel;
    return doc.locationId;
  }
}
