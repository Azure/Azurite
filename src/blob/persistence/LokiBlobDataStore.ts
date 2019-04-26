import {
  close,
  createReadStream,
  createWriteStream,
  fstat,
  mkdir,
  open,
  stat,
  unlink
} from "fs";
import Loki from "lokijs";
import multistream = require("multistream");
import { join } from "path";
import { Duplex } from "stream";
import { promisify } from "util";
import uuid from "uuid/v4";

import ZeroBytesStream from "../../common/ZeroBytesStream";
import {
  BlobModel,
  BlockModel,
  ContainerModel,
  IBlobDataStore,
  IPersistencyChunk,
  ServicePropertiesModel,
  ZERO_PERSISTENCY_CHUNK_ID
} from "./IBlobDataStore";
import LokiAllExtentsAsyncIterator from "./LokiAllExtentsAsyncIterator";
import LokiReferredExtentsAsyncIterator from "./LokiReferredExtentsAsyncIterator";

const statAsync = promisify(stat);
const fstatAsync = promisify(fstat);
const openAsync = promisify(open);
const unlinkAsync = promisify(unlink);
const mkdirAsync = promisify(mkdir);
const closeAsync = promisify(close);

/**
 * Maintains mapping relationship between extent ID and relative local file path/name.
 *
 * @interface IExtentModel
 */
interface IExtentModel {
  /**
   * Extent ID.
   *
   * @type {string}
   * @memberof IExtentModel
   */
  id: string;

  /**
   * Relative local file path/name.
   *
   * @type {string}
   * @memberof IExtentModel
   */
  path: string;
}

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
 *                           // Unique document properties: accountName, containerName, (blob)name, snapshot
 * -- BLOCKS_COLLECTION      // Block blob blocks collection includes all UNCOMMITTED blocks
 *                           // Unique document properties: accountName, containerName, blobName, name, isCommitted
 * -- EXTENTS_COLLECTION     // Collections maintain extents information, including extentID, mapped local file path
 *                           // Unique document properties: id, path
 *
 * @export
 * @class LokiBlobDataStore
 */
export default class LokiBlobDataStore implements IBlobDataStore {
  private readonly db: Loki;

  private initialized: boolean = false;
  private closed: boolean = false;

  private readonly SERVICES_COLLECTION = "$SERVICES_COLLECTION$";
  private readonly CONTAINERS_COLLECTION = "$CONTAINERS_COLLECTION$";
  private readonly BLOBS_COLLECTION = "$BLOBS_COLLECTION$";
  private readonly BLOCKS_COLLECTION = "$BLOCKS_COLLECTION$";
  private readonly EXTENTS_COLLECTION = "$EXTENTS_COLLECTION$";

  private readonly FDCache: Map<string, number> = new Map<string, number>(); // For reading reuse only

  public constructor(
    public readonly lokiDBPath: string,
    public readonly persistencePath: string // private readonly logger: ILogger
  ) {
    this.db = new Loki(lokiDBPath, {
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
    try {
      await statAsync(this.persistencePath);
    } catch {
      await mkdirAsync(this.persistencePath);
    }

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
        indices: ["accountName", "containerName", "name", "snapshot"] // Optimize for find operation
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

    // Create EXTENTS_COLLECTION if not exists
    if (this.db.getCollection(this.EXTENTS_COLLECTION) === null) {
      this.db.addCollection(this.EXTENTS_COLLECTION, {
        indices: ["id", "path"] // Optimize for find operation
      });
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
      this.db.close(err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    const closeFDPromises: Promise<void>[] = [];
    this.FDCache.forEach(fd => {
      closeFDPromises.push(closeAsync(fd));
    });
    await Promise.all(closeFDPromises);

    this.closed = true;
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
      name: blob.name,
      snapshot: blob.snapshot
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
   * @param {string} [snapshot=""]
   * @returns {(Promise<T | undefined>)}
   * @memberof LokiBlobDataStore
   */
  public async getBlob<T extends BlobModel>(
    account: string,
    container: string,
    blob: string,
    snapshot: string = ""
  ): Promise<T | undefined> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const blobDoc = coll.findOne({
      accountName: account,
      containerName: container,
      name: blob,
      snapshot
    });

    if (blobDoc) {
      const blobModel = blobDoc as BlobModel;
      blobModel.properties.contentMD5 = this.restoreUint8Array(
        blobModel.properties.contentMD5
      );
      return blobDoc;
    } else {
      return undefined;
    }
  }

  /**
   * List blobs with query conditions specified.
   *
   * @template T
   * @param {string} [account]
   * @param {string} [container]
   * @param {string} [prefix]
   * @param {number} [maxResults=5000]
   * @param {number} [marker]
   * @returns {(Promise<[T[], number | undefined]>)} A tuple including list blobs and next marker.
   * @memberof LokiBlobDataStore
   */
  public async listBlobs<T extends BlobModel>(
    account?: string,
    container?: string,
    prefix: string | undefined = "",
    maxResults: number | undefined = 5000,
    marker?: number | undefined,
    includeSnapshots?: boolean | undefined
  ): Promise<[T[], number | undefined]> {
    const query: any = {};
    if (prefix !== "") {
      query.name = { $regex: `^${this.escapeRegex(prefix)}` };
    }
    if (account !== undefined) {
      query.accountName = account;
    }
    if (container !== undefined) {
      query.containerName = container;
    }

    query.$loki = { $gt: marker };

    const coll = this.db.getCollection(this.BLOBS_COLLECTION);

    let docs;
    if (includeSnapshots === true) {
      docs = await coll
        .chain()
        .find(query)
        .limit(maxResults)
        .data();
    } else {
      docs = await coll
        .chain()
        .find(query)
        .where(obj => {
          return obj.snapshot.length === 0;
        })
        .limit(maxResults)
        .data();
    }

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

  public async insertExtent(id: string, path: string): Promise<void> {
    const coll = this.db.getCollection(this.EXTENTS_COLLECTION);
    coll.insertOne({ id, path });
  }

  /**
   * Get extent row record from collection. ExtentID or extent mapped relative file path
   * must be provided at least one.
   *
   * @param {string} [id]
   * @param {string} [path]
   * @returns {(Promise<IExtentModel | undefined>)}
   * @memberof LokiBlobDataStore
   */
  public async getExtent(
    id?: string,
    path?: string
  ): Promise<IExtentModel | undefined> {
    if (id === undefined && path === undefined) {
      throw RangeError(
        `LokiBlobDataStore:getExtent() id and path must be provided at least one.`
      );
    }

    const coll = this.db.getCollection(this.EXTENTS_COLLECTION);
    const query: any = {};

    if (id !== undefined) {
      query.id = id;
    }

    if (path !== undefined) {
      query.path = path;
    }

    const extentDoc = coll.findOne(query);
    if (extentDoc) {
      return extentDoc;
    } else {
      return undefined;
    }
  }

  /**
   * List extents segmented.
   *
   * @param {string} [id]
   * @param {string} [path]
   * @param {(number | undefined)} [maxResults=5000]
   * @param {(number | undefined)} [marker]
   * @returns {(Promise<[IExtentModel[], number | undefined]>)}
   * @memberof LokiBlobDataStore
   */
  public async listExtents(
    id?: string,
    path?: string,
    maxResults: number | undefined = 5000,
    marker?: number | undefined
  ): Promise<[IExtentModel[], number | undefined]> {
    const query: any = {};
    if (id !== undefined) {
      query.id = id;
    }
    if (path !== undefined) {
      query.path = path;
    }
    query.$loki = { $gt: marker };

    const coll = this.db.getCollection(this.EXTENTS_COLLECTION);
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
   * Delete an extent row in collection.
   *
   * @param {string} id
   * @returns {Promise<void>}
   * @memberof LokiBlobDataStore
   */
  public async deleteExtent(id: string): Promise<void> {
    const coll = this.db.getCollection(this.EXTENTS_COLLECTION);
    return coll.findAndRemove({ id });
  }

  /**
   * Delete blob item from persistency layer.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} [snapshot=""]
   * @returns {Promise<void>}
   * @memberof LokiBlobDataStore
   */
  public async deleteBlob(
    account: string,
    container: string,
    blob: string,
    snapshot: string = ""
  ): Promise<void> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const blobDoc = coll.findOne({
      accountName: account,
      containerName: container,
      name: blob,
      snapshot
    });

    if (blobDoc) {
      coll.remove(blobDoc);
    }
  }

  public async deleteBlobs(account: string, container: string): Promise<void> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    return coll.findAndRemove({
      accountName: account,
      containerName: container
    });
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
   * @param {string} [account]
   * @param {string} [container]
   * @param {string} [blob]
   * @param {boolean} [isCommitted]
   * @returns {(Promise<T[]>)}
   * @memberof LokiBlobDataStore
   */
  public async listBlocks<T extends BlockModel>(
    account?: string,
    container?: string,
    blob?: string,
    isCommitted?: boolean
  ): Promise<T[]> {
    const query: any = {};
    if (account !== undefined) {
      query.accountName = account;
    }
    if (container !== undefined) {
      query.containerName = container;
    }
    if (blob !== undefined) {
      query.blobName = blob;
    }
    if (isCommitted !== undefined) {
      query.isCommitted = isCommitted;
    }

    const coll = this.db.getCollection(this.BLOCKS_COLLECTION);
    const blockDocs = coll
      .chain()
      .find(query)
      .simplesort("$loki")
      .data();

    return blockDocs;
  }

  /**
   * Persist payload and return a persistency chunk for tracking.
   *
   * @param {NodeJS.ReadableStream | Buffer} payload
   * @returns {Promise<IPersistencyChunk>} Returns the unique persistency chunk
   * @memberof LokiBlobDataStore
   */
  public async writePayload(
    payload: NodeJS.ReadableStream | Buffer
  ): Promise<IPersistencyChunk> {
    const id = this.generateExtentID();
    const file = this.generateRelativeFilePath(id);
    const path = this.getPersistencyPath(file);
    const fd = await this.getPersistencyFD(id, path);

    if (payload instanceof Buffer) {
      return new Promise<IPersistencyChunk>((resolve, reject) => {
        const ws = createWriteStream(path, { fd, autoClose: false });
        ws.end(payload);
        ws.on("finish", () => {
          this.insertExtent(id, file)
            .then(() => {
              resolve({
                id,
                offset: 0,
                count: payload.length
              });
            })
            .catch(reject);
        }).on("error", reject);
      });
    } else {
      return new Promise<IPersistencyChunk>((resolve, reject) => {
        const ws = createWriteStream(path, { fd, autoClose: false });
        let count = 0;
        payload
          .on("data", data => {
            count += data.length;
          })
          .pipe(ws)
          .on("finish", () => {
            this.insertExtent(id, file)
              .then(() => {
                resolve({
                  id,
                  offset: 0,
                  count
                });
              })
              .catch(reject);
          })
          .on("error", reject);
      });
    }
  }

  /**
   * Reads a subset of persistency layer chunk for a given persistency chunk model.
   *
   * @param {IPersistencyChunk} [persistency] Optional. A chunk model pointing to a persistency chunk.
   *                                          Pass undefined will return an empty readable stream without any data.
   *                                          Pass ZERO_PERSISTENCY_CHUNK_ID as persistency.id will return a
   *                                          stream with zero bytes
   * @param {number} [offset] Optional. Payload reads chunk (not extent) offset. Default is 0
   * @param {number} [count] Optional. Payload reads count. Default is Infinity
   * @returns {Promise<NodeJS.ReadableStream>}
   * @memberof LokiBlobDataStore
   */
  public async readPayload(
    persistency?: IPersistencyChunk,
    offset: number = 0,
    count: number = Infinity
  ): Promise<NodeJS.ReadableStream> {
    if (persistency === undefined) {
      const emptyStream = new Duplex();
      emptyStream.end();
      return emptyStream;
    }

    if (persistency.id === ZERO_PERSISTENCY_CHUNK_ID) {
      const subRangeCount = Math.min(count, persistency.count - offset);
      return new ZeroBytesStream(subRangeCount);
    }

    const [path, fd] = await Promise.all([
      this.getExtentPersistencyPath(persistency),
      this.getPersistencyFD(persistency)
    ]);

    if (typeof persistency === "string") {
      return createReadStream(path, {
        start: offset,
        end: offset + count - 1,
        fd,
        autoClose: false
      });
    } else {
      persistency.offset =
        persistency.offset === undefined ? 0 : persistency.offset;
      persistency.count =
        persistency.count === undefined ? Infinity : persistency.count;

      const subRangeOffset = persistency.offset + offset;
      const subRangeCount = Math.min(count, persistency.count - offset);

      return createReadStream(path, {
        start: subRangeOffset,
        end: subRangeOffset + subRangeCount - 1,
        fd,
        autoClose: false
      });
    }
  }

  /**
   * Merge persistency payloads into a single payload and return a ReadableStream
   * from the merged stream according to the offset and count.
   *
   * @param {(IPersistencyChunk)[]} persistencyArray Persistency chunk model list
   * @param {number} [offset] Optional. Reads offset from the merged persistency (sub)chunks. Default is 0
   * @param {number} [count] Optional. Reads count from the merged persistency (sub)chunks. Default is Infinity
   * @returns {Promise<NodeJS.ReadableStream>}
   * @memberof LokiBlobDataStore
   */
  public async readPayloads(
    persistencyArray: (IPersistencyChunk)[],
    offset: number = 0,
    count: number = Infinity
  ): Promise<NodeJS.ReadableStream> {
    const start = offset; // Start inclusive position in the merged stream
    const end = offset + count; // End exclusive position in the merged stream

    const getPayloadSizesPromises: Promise<number>[] = [];
    for (const chunk of persistencyArray) {
      getPayloadSizesPromises.push(this.getPersistencySize(chunk));
    }
    const payloadSizes = await Promise.all(getPayloadSizesPromises);

    const streams: NodeJS.ReadableStream[] = [];
    let payloadOffset = 0; // Current payload offset in the merged stream

    let i = 0;
    for (const chunk of persistencyArray) {
      const payloadSize = payloadSizes[i++];
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
          payloadStart = start - payloadOffset; // Inclusive
        }

        let payloadEnd = Infinity;
        if (end <= nextPayloadOffset) {
          payloadEnd = end - payloadOffset; // Exclusive
        }

        streams.push(
          await this.readPayload(chunk, payloadStart, payloadEnd - payloadStart)
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
   * @param {Iterable<string | IPersistencyChunk>} persistency
   * @returns {Promise<void>}
   * @memberof LokiBlobDataStore
   */
  public async deletePayloads(
    persistency: Iterable<string | IPersistencyChunk>
  ): Promise<void> {
    for (const id of persistency) {
      const path = await this.getExtentPersistencyPath(id);
      const idStr = typeof id === "string" ? id : id.id;
      try {
        await unlinkAsync(path);
        await this.deleteExtent(idStr);
      } catch (err) {
        if (err.code === "ENOENT") {
          await this.deleteExtent(idStr);
        }
      }
    }
  }

  /**
   * Create an async iterator to enumerate all extent IDs.
   *
   * @returns {AsyncIterator<string[]>}
   * @memberof IBlobDataStore
   */
  public iteratorAllExtents(): AsyncIterator<string[]> {
    return new LokiAllExtentsAsyncIterator(this);
  }

  /**
   * Create an async iterator to enumerate all extent records referred or being used.
   *
   * @returns {AsyncIterator<IPersistencyChunk[]>}
   * @memberof IBlobDataStore
   */
  public iteratorReferredExtents(): AsyncIterator<IPersistencyChunk[]> {
    // By default, we disable detailed log for GC
    return new LokiReferredExtentsAsyncIterator(this /*, this.logger*/);
  }

  /**
   * Allocate a new extent ID.
   *
   * @private
   * @returns {string}
   * @memberof LokiBlobDataStore
   */
  private generateExtentID(): string {
    return uuid();
  }

  /**
   * Generate a file name/path relative to persistencePath for a given extent ID.
   *
   * @private
   * @param {string} id Extent ID
   * @returns {string}
   * @memberof LokiBlobDataStore
   */
  private generateRelativeFilePath(id: string): string {
    return id;
  }

  /**
   * Get a full path for a give relative file path.
   * The full path could be used to open, read and write files.
   *
   * @private
   * @param {string} relativePath
   * @returns {string}
   * @memberof LokiBlobDataStore
   */
  private getPersistencyPath(relativePath: string): string {
    return join(this.persistencePath, relativePath);
  }

  /**
   * Get persistency file path for an created extent.
   * The full path could be used to open, read and write files.
   *
   * @private
   * @param {(string | IPersistencyChunk)} persistency Extent ID or chunk
   * @returns {Promise<string>}
   * @memberof LokiBlobDataStore
   */
  private async getExtentPersistencyPath(
    persistency: string | IPersistencyChunk
  ): Promise<string> {
    let id: string;
    if (typeof persistency === "string") {
      id = persistency;
    } else {
      id = persistency.id;
    }

    const extent = await this.getExtent(id);
    if (extent === undefined) {
      throw new Error(
        `LokiBlobDataStore:getPersistencyPath() cannot find extent record for given id ${id}`
      );
    }

    return this.getPersistencyPath(extent.path);
  }

  /**
   * Cache opened file descriptors for reusing.
   *
   * TODO: Limit cache size.
   *
   * @private
   * @param {(string | IPersistencyChunk)} persistency
   * @param {string} [path]
   * @returns {Promise<number>}
   * @memberof LokiBlobDataStore
   */
  private async getPersistencyFD(
    persistency: string | IPersistencyChunk,
    path?: string
  ): Promise<number> {
    // If not a specified full path provided, try to get path from DB record
    if (path === undefined) {
      path = await this.getExtentPersistencyPath(persistency);
    }

    let fd = this.FDCache.get(path);
    if (fd !== undefined) {
      return fd;
    }

    fd = await openAsync(path, "a+", undefined);
    this.FDCache.set(path, fd);
    return fd;
  }

  /**
   * Get size for a given persistency (sub)chunk.
   *
   * @private
   * @param {IPersistencyChunk } persistency
   * @returns {Promise<number>}
   * @memberof LokiBlobDataStore
   */
  private async getPersistencySize(
    persistency: IPersistencyChunk
  ): Promise<number> {
    // TODO: Add a path size cache, we assume different payloads will always has different persistency
    // ID and path. So the cache will always align with the persisted files.
    if (typeof persistency === "string") {
      const fd = await this.getPersistencyFD(persistency);
      return (await fstatAsync(fd)).size;
    } else {
      if (persistency.count === undefined) {
        const fd = await this.getPersistencyFD(persistency);
        persistency.offset =
          persistency.offset === undefined ? 0 : persistency.offset;
        return (await fstatAsync(fd)).size - persistency.offset;
      } else {
        return persistency.count;
      }
    }
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
