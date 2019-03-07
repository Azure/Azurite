import { createReadStream, createWriteStream, mkdir, stat, unlink } from "fs";
import Loki from "lokijs";
import multistream = require("multistream");
import { join } from "path";
import { Duplex } from "stream";
import { promisify } from "util";
import uuid from "uuid/v4";

import { API_VERSION } from "../utils/constants";
import {
  BlobModel,
  BlockModel,
  ContainerModel,
  IBlobDataStore,
  ServicePropertiesModel,
} from "./IBlobDataStore";

/**
 * This is a persistency layer data source implementation based on loki DB.
 *
 * Notice that, following design is for emulator purpose only,
 * and doesn't design for best performance. We may want to optimize the collection design according to different
 * access frequency and data size.
 *
 * Loki DB includes following collections and documents:
 *
 * -- SERVICE_PROPERTIES_COLLECTION // Collection contains service properties
 *                                  // Only 1 document will be kept
 *                                  // Default collection name is $SERVICE_PROPERTIES_COLLECTION$
 * -- CONTAINERS_COLLECTION // Collection contains all container items
 *                          // Default collection name is $CONTAINERS_COLLECTION$
 *                          // Each document maps to 1 container
 *                          // Unique document properties: name
 * -- <CONTAINER_COLLECTION> // Every container collection 1:1 maps to a container
 *                           // Container collection contains all blobs under a container
 *                           // Collection name equals to a container name
 *                           // Each document 1:1 maps to a blob
 *                           // Unique document properties: name
 * -- <BLOCKS_COLLECTION>    // Block blob blocks collection includes all blocks
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

  private readonly CONTAINERS_COLLECTION = "$CONTAINERS_COLLECTION$";
  private readonly SERVICE_PROPERTIES_COLLECTION =
    "$SERVICE_PROPERTIES_COLLECTION$";
  private readonly BLOCKS_COLLECTION = "$BLOCKS_COLLECTION$";

  private servicePropertiesDocumentID?: number;

  private readonly defaultServiceProperties = {
    cors: [],
    defaultServiceVersion: API_VERSION,
    hourMetrics: {
      enabled: false,
      retentionPolicy: {
        enabled: false,
      },
      version: "1.0",
    },
    logging: {
      deleteProperty: true,
      read: true,
      retentionPolicy: {
        enabled: false,
      },
      version: "1.0",
      write: true,
    },
    minuteMetrics: {
      enabled: false,
      retentionPolicy: {
        enabled: false,
      },
      version: "1.0",
    },
    staticWebsite: {
      enabled: false,
    },
  };

  public constructor(
    private readonly lokiDBPath: string,
    private readonly persistencePath: string, // private readonly logger: ILogger
  ) {
    this.db = new Loki(lokiDBPath, {
      autosave: true,
      autosaveInterval: 5000,
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

    // TODO: Native Promise doesn't have promisifyAll method. Create it as utility manually
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
          // when DB file doesn't exist, ignore the error because following will re-initialize
          resolve();
        }
      });
    });

    // In loki DB implementation, these operations are all sync. Doesn't need an async lock
    // Create containers collection if not exists
    if (this.db.getCollection(this.CONTAINERS_COLLECTION) === null) {
      this.db.addCollection(this.CONTAINERS_COLLECTION, { unique: ["name"] }); // Optimize for coll.by operation
    }

    if (this.db.getCollection(this.BLOCKS_COLLECTION) === null) {
      this.db.addCollection(this.BLOCKS_COLLECTION, {
        // Optimization for indexing and searching
        // https://rawgit.com/techfort/LokiJS/master/jsdoc/tutorial-Indexing%20and%20Query%20performance.html
        indices: ["containerName", "blobName", "name"], // Optimize for find operation
      });
    }

    // Create service properties collection if not exists
    let servicePropertiesColl = this.db.getCollection(
      this.SERVICE_PROPERTIES_COLLECTION,
    );
    if (servicePropertiesColl === null) {
      servicePropertiesColl = this.db.addCollection(
        this.SERVICE_PROPERTIES_COLLECTION,
      );
    }

    // Create default service properties document if not exists
    // Get SERVICE_PROPERTIES_DOCUMENT_LOKI_ID from DB if not exists
    const servicePropertiesDocs = servicePropertiesColl.where(() => true);
    if (servicePropertiesDocs.length === 0) {
      await this.setServiceProperties(this.defaultServiceProperties);
    } else if (servicePropertiesDocs.length === 1) {
      this.servicePropertiesDocumentID = servicePropertiesDocs[0].$loki;
    } else {
      throw new Error(
        "LokiDB initialization error: Service properties collection has more than one document.",
      );
    }

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
  public async setServiceProperties<T extends ServicePropertiesModel>(
    serviceProperties: T,
  ): Promise<T> {
    const coll = this.db.getCollection(this.SERVICE_PROPERTIES_COLLECTION);
    if (this.servicePropertiesDocumentID !== undefined) {
      const existingDocument = coll.get(this.servicePropertiesDocumentID);
      coll.remove(existingDocument);
    }

    const doc = coll.insert(serviceProperties);
    this.servicePropertiesDocumentID = doc.$loki;
    return doc;
  }

  /**
   * Get service properties.
   * Assume service properties collection has already be initialized with 1 document.
   *
   * @template T
   * @returns {Promise<T>}
   * @memberof LokiBlobDataStore
   */
  public async getServiceProperties<
    T extends ServicePropertiesModel
  >(): Promise<T> {
    const coll = this.db.getCollection(this.SERVICE_PROPERTIES_COLLECTION);
    return coll.get(this.servicePropertiesDocumentID!); // Only 1 document in service properties collection
  }

  /**
   * Get a container item from DB by container name.
   *
   * @template T
   * @param {string} container
   * @returns {Promise<T>}
   * @memberof LokiBlobDataStore
   */
  public async getContainer<T extends ContainerModel>(
    container: string,
  ): Promise<T | undefined> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = coll.by("name", container);
    return doc ? doc : undefined;
  }

  /**
   * Delete container item if exists from DB.
   * Note that this method will remove container related collections and documents from DB.
   * Make sure blobs under the container has been properly removed before calling this method.
   *
   * @param {string} container
   * @returns {Promise<void>}
   * @memberof LokiBlobDataStore
   */
  public async deleteContainer(container: string): Promise<void> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = coll.by("name", container);

    if (doc) {
      coll.remove(doc);
    }

    // Following line will remove all blobs documents under that container
    this.db.removeCollection(container);
  }

  /**
   * Update a container item in DB. If the container doesn't exist, it will be created.
   * For a update operation, parameter container should be a valid loki DB document object
   * retrieved by calling getContainer().
   *
   * @template T
   * @param {T} container For a update operation, the container should be a loki document object got from getContainer()
   * @returns {Promise<T>}
   * @memberof LokiBlobDataStore
   */
  public async updateContainer<T extends ContainerModel>(
    container: T,
  ): Promise<T> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = coll.by("name", container.name);
    if (doc) {
      return coll.update(container);
    } else {
      if (!this.db.getCollection(container.name)) {
        this.db.addCollection(container.name, { unique: ["name"] });
      }
      return coll.insert(container);
    }
  }

  /**
   * List containers with query conditions specified.
   *
   * @template T
   * @param {string} [prefix=""]
   * @param {number} [maxResults=2000]
   * @param {number} [marker=0]
   * @returns {(Promise<[T[], number | undefined]>)} Return a tuple with [LIST_CONTAINERS, NEXT_MARKER]
   * @memberof LokiBlobDataStore
   */
  public async listContainers<T extends ContainerModel>(
    prefix: string = "",
    maxResults: number = 2000,
    marker: number = 0,
  ): Promise<[T[], number | undefined]> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);

    const query =
      prefix === ""
        ? { $loki: { $gt: marker } }
        : { name: { $regex: `^${prefix}` }, $loki: { $gt: marker } };

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
   * Update blob item in DB. Will create if blob doesn't exist.
   *
   * @template T A BlobItem model compatible object
   * @param {string} container Container name
   * @param {T} blob For a update operation, blob should be a valid loki DB document object retrieved by getBlob()
   * @returns {Promise<T>}
   * @memberof LokiBlobDataStore
   */
  public async updateBlob<T extends BlobModel>(
    container: string,
    blob: T,
  ): Promise<T> {
    const coll = this.db.getCollection(container);
    const blobDoc = coll.findOne({ name: { $eq: blob.name } });
    if (blobDoc !== undefined && blobDoc !== null) {
      coll.remove(blobDoc);
    }
    return coll.insert(blob);
  }

  /**
   * Gets a blob item from persistency layer by container name and blob name.
   *
   * @template T
   * @param {string} container
   * @param {string} blob
   * @returns {(Promise<T | undefined>)}
   * @memberof IBlobDataStore
   */
  public async getBlob<T extends BlobModel>(
    container: string,
    blob: string,
  ): Promise<T | undefined> {
    const containerItem = await this.getContainer(container);
    if (!containerItem) {
      return undefined;
    }

    const coll = this.db.getCollection(container);
    if (!coll) {
      return undefined;
    }

    const blobItem = coll.by("name", blob);
    if (!blobItem) {
      return undefined;
    }

    return blobItem;
  }

  /**
   * Delete a blob item from loki DB if exists.
   *
   * @param {string} container
   * @param {string} blob
   * @returns {Promise<void>}
   * @memberof LokiBlobDataStore
   */
  public async deleteBlob(container: string, blob: string): Promise<void> {
    const blobItem = await this.getBlob(container, blob);
    if (blobItem) {
      const coll = this.db.getCollection(container);
      coll.remove(blobItem);
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
      containerName: block.containerName,
      blobName: block.blobName,
      name: block.name,
    });

    if (blockDoc !== undefined && blockDoc !== null) {
      coll.remove(blockDoc);
    }
    return coll.insert(block);
  }

  public insertBlocks<T extends BlockModel>(blocks: T[]): Promise<T[]> {
    throw new Error("Method not implemented.");
  }

  public async deleteBlocks<T extends BlockModel>(
    container: string,
    blob: string,
  ): Promise<T[]> {
    throw new Error("Method not implemented.");
  }

  /**
   * Gets block for a blob from persistency layer by
   * container name, blob name and block name.
   *
   * @template T
   * @param {string} container
   * @param {string} blob
   * @param {string} block
   * @returns {Promise<T | undefined>}
   * @memberof LokiBlobDataStore
   */
  public async getBlock<T extends BlockModel>(
    container: string,
    blob: string,
    block: string,
  ): Promise<T | undefined> {
    const coll = this.db.getCollection(this.BLOCKS_COLLECTION);
    const blockDoc = coll.findOne({
      containerName: container,
      blobName: blob,
      name: block,
    });

    return blockDoc;
  }

  /**
   * Gets blocks list for a blob from persistency layer by container name and blob name.
   *
   * @template T
   * @param {string} container
   * @param {string} blob
   * @returns {Promise<T[]>}
   * @memberof LokiBlobDataStore
   */
  public async getBlocks<T extends BlockModel>(
    container: string,
    blob: string,
  ): Promise<T[]> {
    const coll = this.db.getCollection(this.BLOCKS_COLLECTION);
    const blockDocs = coll
      .chain()
      .find({
        containerName: container,
        blobName: blob,
      })
      .simplesort("$loki") // We assume blocks in a blocks are in order stored
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
    count: number = Infinity,
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
    count: number = Infinity,
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
          payloadStart = payloadOffset - start;
        }

        let payloadEnd = Infinity;
        if (end <= nextPayloadOffset) {
          payloadEnd = end - payloadOffset - 1;
        }

        streams.push(
          createReadStream(path, { start: payloadStart, end: payloadEnd }),
        );
        payloadOffset = nextPayloadOffset;
      }
    }

    // TODO: What happens when count exceeds merged payload length?
    // throw an error of just return as much data as we can?
    if (payloadOffset < end) {
      throw new RangeError(
        // tslint:disable-next-line:max-line-length
        `Not enough payload data error. Total length of payloads is ${payloadOffset}, while required data offset is ${offset}, count is ${count}.`,
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
}
