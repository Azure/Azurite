import { createReadStream, createWriteStream, mkdir, stat, unlink } from "fs";
import Loki from "lokijs";
import multistream = require("multistream");
import { join } from "path";
import { Duplex } from "stream";
import { promisify } from "util";
import uuid from "uuid/v4";

import { BlobModel, BlockModel, ContainerModel, IBlobDataStore, ServicePropertiesModel } from "./IBlobDataStore";

/**
 * This is a persistency layer data source implementation based on loki DB.
 *
 * Notice that, following design is for emulator purpose only, and doesn't design for best performance.
 * We may want to optimize the persistency layer performance in the future. Such as by distributing metadata
 * into different collections, or make binary payload write as an append-only pattern.
 *
 * Loki DB includes following collections and documents:
 *
 * -- SERVICE_PROPERTIES_COLLECTION // Collection contains service properties
 *                                  // Default collection name is $SERVICES_COLLECTION$
 *                                  // Each document maps to 1 account blob service
 *                                  // Unique document properties: accountName
 * -- CONTAINERS_COLLECTION  // Collection contains all containers
 *                           // Default collection name is $CONTAINERS_COLLECTION$
 *                           // Each document maps to 1 container
 *                           // Unique document properties: accountName, (container)name
 * -- BLOBS_COLLECTION       // Collection contains all blobs
 *                           // Default collection name is $BLOBS_COLLECTION$
 *                           // Each document maps to a blob
 *                           // Unique document properties: accountName, containerName, (blob)name
 * -- BLOCKS_COLLECTION      // Block blob blocks collection includes all UNCOMMITTED blocks
 *                           // Unique document properties: (blob)name, blockID
 *
 * TODO:
 * 1. Create an async task to GC persistency files
 *
 * @export
 * @class LokiBlobDataStore
 */
export default class LokiBlobDataStore implements IBlobDataStore {
  private readonly db: Loki;

  private readonly SERVICES_COLLECTION = "$SERVICES_COLLECTION$";
  private readonly CONTAINERS_COLLECTION = "$CONTAINERS_COLLECTION$";
  private readonly BLOBS_COLLECTION = "$BLOBS_COLLECTION$";
  private readonly BLOCKS_COLLECTION = "$BLOCKS_COLLECTION$";

  public constructor(
    private readonly lokiDBPath: string,
    private readonly persistencePath: string // private readonly logger: ILogger
  ) {
    this.db = new Loki(lokiDBPath, {
      autosave: true,
      autosaveInterval: 5000
    });
  }

  public async init(): Promise<void> {
    const statAsync = promisify(stat);
    const mkdirAsync = promisify(mkdir);
    try {
      await statAsync(this.persistencePath);
    } catch {
      await mkdirAsync(this.persistencePath);
    }

    // TODO: Native Promise doesn't have promisifyAll method. Create it into utils helpers
    await new Promise<void>((resolve, reject) => {
      stat(this.lokiDBPath, (statError, stats) => {
        if (!statError) {
          this.db.loadDatabase({}, dbError => {
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

    // In loki DB implementation, these operations are all sync. Doesn't need an async lock

    // Create service properties collection if not exists
    let servicePropertiesColl = this.db.getCollection(this.SERVICES_COLLECTION);
    if (servicePropertiesColl === null) {
      servicePropertiesColl = this.db.addCollection(this.SERVICES_COLLECTION, {
        unique: ["accountName"]
      });
    }

    // Create containers collection if not exists
    if (this.db.getCollection(this.CONTAINERS_COLLECTION) === null) {
      this.db.addCollection(this.CONTAINERS_COLLECTION, {
        // Optimization for indexing and searching
        // https://rawgit.com/techfort/LokiJS/master/jsdoc/tutorial-Indexing%20and%20Query%20performance.html
        indices: ["accountName", "name"]
      }); // Optimize for find operation
    }

    // Create containers collection if not exists
    if (this.db.getCollection(this.BLOBS_COLLECTION) === null) {
      this.db.addCollection(this.BLOBS_COLLECTION, {
        indices: ["accountName", "containerName", "name"] // Optimize for find operation
      });
    }

    // Create blocks collection if not exists
    if (this.db.getCollection(this.BLOCKS_COLLECTION) === null) {
      this.db.addCollection(this.BLOCKS_COLLECTION, {
        indices: [
          "accountName",
          "containerName",
          "blobName",
          "name",
          "isCommitted"
        ] // Optimize for find operation
      });
    }

    // Create default service properties document if not exists
    // Get SERVICE_PROPERTIES_DOCUMENT_LOKI_ID from DB if not exists
    // const servicePropertiesDocs = servicePropertiesColl.where(() => true);
    // if (servicePropertiesDocs.length === 0) {
    //   await this.updateServiceProperties(this.defaultServiceProperties);
    // } else if (servicePropertiesDocs.length === 1) {
    //   this.servicePropertiesDocumentID = servicePropertiesDocs[0].$loki;
    // } else {
    //   throw new Error(
    //     "LokiDB initialization error: Service properties collection has more than one document."
    //   );
    // }

    await new Promise((resolve, reject) => {
      this.db.saveDatabase(err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Close loki DB.
   *
   * @returns {Promise<void>}
   * @memberof LokiBlobDataStore
   */
  public async close(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.db.close(err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Update blob service properties. Create service properties document if not exists in DB.
   * Assume service properties collection has been created.
   *
   * @template T
   * @param {T} serviceProperties
   * @returns {Promise<T>}
   * @memberof LokiBlobDataStore
   */
  public async updateServiceProperties<T extends ServicePropertiesModel>(
    serviceProperties: T
  ): Promise<T> {
    const coll = this.db.getCollection(this.SERVICES_COLLECTION);
    const doc = coll.by("accountName", serviceProperties.accountName);
    if (doc) {
      coll.remove(doc);
    }

    delete (serviceProperties as any).$loki;
    return coll.insert(serviceProperties);
  }

  /**
   * Get service properties.
   *
   * @param {string} account
   * @template T
   * @returns {Promise<T | undefined>}
   * @memberof LokiBlobDataStore
   */
  public async getServiceProperties<T extends ServicePropertiesModel>(
    account: string
  ): Promise<T | undefined> {
    const coll = this.db.getCollection(this.SERVICES_COLLECTION);
    const doc = coll.by("accountName", account);
    return doc ? doc : undefined;
  }

  /**
   * Get a container item from persistency layer by account and container name.
   *
   * @template T
   * @param {string} account
   * @param {string} container
   * @returns {(Promise<T | undefined>)}
   * @memberof LokiBlobDataStore
   */
  public async getContainer<T extends ContainerModel>(
    account: string,
    container: string
  ): Promise<T | undefined> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = coll.findOne({ accountName: account, name: container });
    return doc ? doc : undefined;
  }

  /**
   * Delete container item if exists from persistency layer.
   * Note that this method will only remove container related document from persistency layer.
   * Make sure blobs under the container has been properly handled before calling this method.
   *
   * @param {string} account
   * @param {string} container
   * @returns {Promise<void>}
   * @memberof LokiBlobDataStore
   */
  public async deleteContainer(
    account: string,
    container: string
  ): Promise<void> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = coll.findOne({ accountName: account, name: container });
    if (doc) {
      coll.remove(doc);
    }
  }

  /**
   * Update a container item in persistency layer. If the container doesn't exist, it will be created.
   *
   * @template T
   * @param {T} container
   * @returns {Promise<T>}
   * @memberof LokiBlobDataStore
   */
  public async updateContainer<T extends ContainerModel>(
    container: T
  ): Promise<T> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = coll.findOne({
      accountName: container.accountName,
      name: container.name
    });

    if (doc) {
      coll.remove(doc);
    }

    delete (container as any).$loki;
    return coll.insert(container);
  }

  /**
   * List containers with query conditions specified.
   *
   * @template T
   * @param {string} account
   * @param {string} [prefix]
   * @param {number} [maxResults=2000]
   * @param {number} [marker]
   * @returns {(Promise<[T[], number | undefined]>)} A tuple including containers and next marker
   * @memberof LokiBlobDataStore
   */
  public async listContainers<T extends ContainerModel>(
    account: string,
    prefix: string = "",
    maxResults: number = 2000,
    marker: number = 0
  ): Promise<[T[], number | undefined]> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);

    const query =
      prefix === ""
        ? { $loki: { $gt: marker }, accountName: account }
        : {
            name: { $regex: `^${this.escapeRegex(prefix)}` },
            $loki: { $gt: marker },
            accountName: account
          };

    const docs = coll
      .chain()
      .find(query)
      .limit(maxResults)
      .data();

    if (docs.length < maxResults) {
      return [docs, undefined];
    } else {
      const nextMarker = docs[docs.length - 1].$loki;
      return [docs, nextMarker];
    }
  }

  /**
   * Update blob item in persistency layer. Will create if blob doesn't exist.
   *
   * @template T
   * @param {T} blob
   * @returns {Promise<T>}
   * @memberof LokiBlobDataStore
   */
  public async updateBlob<T extends BlobModel>(blob: T): Promise<T> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const blobDoc = coll.findOne({
      accountName: blob.accountName,
      containerName: blob.containerName,
      name: blob.name
    });
    if (blobDoc) {
      coll.remove(blobDoc);
    }

    delete (blob as any).$loki;
    return coll.insert(blob);
  }

  /**
   * Gets a blob item from persistency layer by container name and blob name.
   *
   * @template T
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @returns {(Promise<T | undefined>)}
   * @memberof IBlobDataStore
   */
  public async getBlob<T extends BlobModel>(
    account: string,
    container: string,
    blob: string
  ): Promise<T | undefined> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const blobDoc = coll.findOne({
      accountName: account,
      containerName: container,
      name: blob
    });

    if (blobDoc) {
      const blobModel = blobDoc as BlobModel;
      blobModel.properties.contentMD5 = this.restoreUint8Array(
        blobModel.properties.contentMD5
      );
    }

    return blobDoc;
  }

  /**
   * List blobs with query conditions specified.
   *
   * @template T
   * @param {string} account
   * @param {string} container
   * @param {string} [prefix]
   * @param {number} [maxResults=5000]
   * @param {number} [marker]
   * @returns {(Promise<[T[], number | undefined]>)} A tuple including list blobs and next marker.
   * @memberof LokiBlobDataStore
   */
  public async listBlobs<T extends BlobModel>(
    account: string,
    container: string,
    prefix: string | undefined = "",
    maxResults: number | undefined = 5000,
    marker?: number | undefined
  ): Promise<[T[], number | undefined]> {
    const query =
      prefix === ""
        ? {
            $loki: { $gt: marker },
            accountName: account,
            containerName: container
          }
        : {
            name: {
              $regex: `^${this.escapeRegex(prefix)}`
            },
            $loki: { $gt: marker },
            accountName: account,
            containerName: container
          };

    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const docs = coll
      .chain()
      .find(query)
      .limit(maxResults)
      .data();

    for (const doc of docs) {
      const blobDoc = doc as BlobModel;
      blobDoc.properties.contentMD5 = this.restoreUint8Array(
        blobDoc.properties.contentMD5
      );
    }

    if (docs.length < maxResults) {
      return [docs, undefined];
    } else {
      const nextMarker = docs[docs.length - 1].$loki;
      return [docs, nextMarker];
    }
  }

  /**
   * Delete blob item from persistency layer.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @returns {Promise<void>}
   * @memberof LokiBlobDataStore
   */
  public async deleteBlob(
    account: string,
    container: string,
    blob: string
  ): Promise<void> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const blobDoc = coll.findOne({
      accountName: account,
      containerName: container,
      name: blob
    });

    if (blobDoc) {
      coll.remove(blobDoc);
    }
  }

  /**
   * Update block in DB. Will create if block doesn't exist.
   *
   * @template T
   * @param {T} block
   * @returns {Promise<T>}
   * @memberof LokiBlobDataStore
   */
  public async updateBlock<T extends BlockModel>(block: T): Promise<T> {
    const coll = this.db.getCollection(this.BLOCKS_COLLECTION);
    const blockDoc = coll.findOne({
      accountName: block.accountName,
      containerName: block.containerName,
      blobName: block.blobName,
      name: block.name,
      isCommitted: block.isCommitted
    });

    if (blockDoc) {
      coll.remove(blockDoc);
    }

    delete (block as any).$loki;
    return coll.insert(block);
  }

  /**
   * Delete all blocks for a blob in persistency layer.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @returns {Promise<void>}
   * @memberof LokiBlobDataStore
   */
  public async deleteBlocks(
    account: string,
    container: string,
    blob: string
  ): Promise<void> {
    const coll = this.db.getCollection(this.BLOCKS_COLLECTION);
    coll
      .chain()
      .find({
        accountName: account,
        containerName: container,
        blobName: blob
      })
      .remove();
  }

  /**
   * Insert blocks for a blob in persistency layer. Existing blocks with same name will be replaced.
   *
   * @template T
   * @param {T[]} blocks
   * @returns {Promise<T[]>}
   * @memberof LokiBlobDataStore
   */
  public insertBlocks<T extends BlockModel>(blocks: T[]): Promise<T[]> {
    for (const block of blocks) {
      delete (block as any).$loki;
    }
    const coll = this.db.getCollection(this.BLOCKS_COLLECTION);
    return coll.insert(blocks);
  }

  /**
   * Gets block for a blob from persistency layer by account, container, blob and block names.
   *
   * @template T
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} block
   * @param {boolean} isCommitted
   * @returns {Promise<T | undefined>}
   * @memberof LokiBlobDataStore
   */
  public async getBlock<T extends BlockModel>(
    account: string,
    container: string,
    blob: string,
    block: string,
    isCommitted: boolean
  ): Promise<T | undefined> {
    const coll = this.db.getCollection(this.BLOCKS_COLLECTION);
    const blockDoc = coll.findOne({
      accountName: account,
      containerName: container,
      blobName: blob,
      name: block,
      isCommitted
    });

    return blockDoc;
  }

  /**
   * Gets blocks list for a blob from persistency layer by account, container and blob names.
   *
   * @template T
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {boolean} isCommitted
   * @returns {(Promise<T[]>)}
   * @memberof LokiBlobDataStore
   */
  public async listBlocks<T extends BlockModel>(
    account: string,
    container: string,
    blob: string,
    isCommitted: boolean
  ): Promise<T[]> {
    const coll = this.db.getCollection(this.BLOCKS_COLLECTION);
    const blockDocs = coll
      .chain()
      .find({
        accountName: account,
        containerName: container,
        blobName: blob,
        isCommitted
      })
      .simplesort("$loki")
      .data();

    return blockDocs;
  }

  /**
   * Persist payload and return a unique persistency ID for tracking.
   *
   * @param {NodeJS.ReadableStream} payload
   * @returns {Promise<string>}
   * @memberof LokiBlobDataStore
   */
  public async writePayload(payload: NodeJS.ReadableStream): Promise<string> {
    const persistencyID = this.getPersistencyID();
    const persistencyPath = this.getPersistencyPath(persistencyID);

    return new Promise<string>((resolve, reject) => {
      const ws = createWriteStream(persistencyPath);
      payload
        .pipe(ws)
        .on("close", () => {
          resolve(persistencyID);
        })
        .on("error", reject);
    });
  }

  /**
   * Reads a persistency layer payload with a persistency ID.
   *
   * @param {string} [persistencyID] Persistency payload ID
   * @param {number} [offset] Optional. Payload reads offset. Default is 0.
   * @param {number} [count] Optional. Payload reads count. Default is Infinity.
   * @returns {Promise<NodeJS.ReadableStream>}
   * @memberof LokiBlobDataStore
   */
  public async readPayload(
    persistencyID?: string,
    offset: number = 0,
    count: number = Infinity
  ): Promise<NodeJS.ReadableStream> {
    if (persistencyID === undefined) {
      const emptyStream = new Duplex();
      emptyStream.end();
      return emptyStream;
    }

    const path = this.getPersistencyPath(persistencyID);
    return createReadStream(path, { start: offset, end: offset + count });
  }

  /**
   * Merge persistency payloads into a single payload and return a ReadableStream
   * from the merged stream according to the offset and count.
   *
   * @param {string[]} persistencyIDs Persistency payload ID list
   * @param {number} [offset] Optional. Payload reads offset. Default is 0.
   * @param {number} [count] Optional. Payload reads count. Default is Infinity.
   * @returns {Promise<NodeJS.ReadableStream>}
   * @memberof LokiBlobDataStore
   */
  public async readPayloads(
    persistencyIDs: string[],
    offset: number = 0,
    count: number = Infinity
  ): Promise<NodeJS.ReadableStream> {
    const start = offset; // Start inclusive position in the merged stream
    const end = offset + count; // End exclusive position in the merged stream

    const streams: NodeJS.ReadableStream[] = [];
    const statAsync = promisify(stat);

    let payloadOffset = 0; // Current payload offset in the merged stream

    for (const id of persistencyIDs) {
      const path = this.getPersistencyPath(id);
      // TODO: Add a path size cache, we assume different payloads will always has different persistency
      // ID and path. So the cache will always align with the persisted files.
      const payloadSize = (await statAsync(path)).size;
      const nextPayloadOffset = payloadOffset + payloadSize;

      if (nextPayloadOffset <= start) {
        payloadOffset = nextPayloadOffset;
        continue;
      } else if (end <= payloadOffset) {
        // Nothing to read anymore
        break;
      } else {
        let payloadStart = 0;
        if (start > payloadOffset) {
          payloadStart = start - payloadOffset;
        }

        let payloadEnd = Infinity;
        if (end <= nextPayloadOffset) {
          payloadEnd = end - payloadOffset - 1;
        }

        streams.push(
          createReadStream(path, { start: payloadStart, end: payloadEnd })
        );
        payloadOffset = nextPayloadOffset;
      }
    }

    // TODO: What happens when count exceeds merged payload length?
    // throw an error of just return as much data as we can?
    if (end !== Infinity && payloadOffset < end) {
      throw new RangeError(
        // tslint:disable-next-line:max-line-length
        `Not enough payload data error. Total length of payloads is ${payloadOffset}, while required data offset is ${offset}, count is ${count}.`
      );
    }

    return multistream(streams);
  }

  /**
   * Remove payloads from persistency layer.
   *
   * @param {string[]} persistencyIDs
   * @returns {Promise<void>}
   * @memberof LokiBlobDataStore
   */
  public async deletePayloads(persistencyIDs: string[]): Promise<void> {
    const unlinkAsync = promisify(unlink);

    // TODO: Throw exceptions or skip exceptions?
    for (const id of persistencyIDs) {
      const path = this.getPersistencyPath(id);
      try {
        await unlinkAsync(path);
      } catch {
        /** NOOP */
      }
    }
  }

  /**
   * Get persistency file path for a resource with persistencyID provided.
   * Warning: Modify this method may result existing payloads cannot be found.
   *
   * @private
   * @param {string} persistencyID
   * @returns {string}
   * @memberof LokiBlobDataStore
   */
  private getPersistencyPath(persistencyID: string): string {
    return join(this.persistencePath, persistencyID);
  }

  /**
   * Maps a blob or block to a unique ID used as persisted local file name.
   * Note that, this method is only used to calculate persistency IDs for new blob or blocks.
   *
   * DO NOT use this method for existing blobs or blocks, as the calculation algorithm may
   * change without warning.
   *
   * @private
   * @returns {string} Unique persistency ID
   * @memberof LokiBlobDataStore
   */
  private getPersistencyID(): string {
    return uuid();
  }

  /**
   * LokiJS will persist Uint8Array into Object.
   * This method will restore object to Uint8Array.
   *
   * @private
   * @param {*} obj
   * @returns {(Uint8Array | undefined)}
   * @memberof LokiBlobDataStore
   */
  private restoreUint8Array(obj: any): Uint8Array | undefined {
    if (typeof obj !== "object") {
      return undefined;
    }

    if (obj instanceof Uint8Array) {
      return obj;
    }

    if (obj.type === "Buffer") {
      obj = obj.data;
    }

    const length = Object.keys(obj).length;
    const arr = Buffer.allocUnsafe(length);

    for (let i = 0; i < length; i++) {
      if (!obj.hasOwnProperty(i)) {
        throw new TypeError(
          `Cannot restore loki DB persisted object to Uint8Array. Key ${i} is missing.`
        );
      }

      arr[i] = obj[i];
    }

    return arr;
  }

  /**
   * Escape a string to be used as a regex.
   *
   * @private
   * @param {string} regex
   * @returns {string}
   * @memberof LokiBlobDataStore
   */
  private escapeRegex(regex: string): string {
    return regex.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  }
}
