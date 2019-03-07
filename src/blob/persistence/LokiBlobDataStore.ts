import { createReadStream, createWriteStream, mkdir, stat } from "fs";
import Loki from "lokijs";
import { join } from "path";
import { promisify } from "util";

import * as Models from "../generated/artifacts/models";
import { API_VERSION } from "../utils/constants";
import { IBlobDataStore } from "./IBlobDataStore";

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
 * -- <BLOCK_BLOB_BLOCKS_COLLECTION>    // Block blob blocks collection includes all blocks
 *                                      // Unique document properties: (blob)name, blockID
 * -- <PAGE_BLOB_PAGES_COLLECTION>      // Page blob pages collection includes all pages
 * -- <APPEND_BLOB_BLOCKS_COLLECTION>   // Append blob blocks collection includes all append blob blocks
 *
 * @export
 * @class LokiBlobDataStore
 */
export default class LokiBlobDataStore implements IBlobDataStore {
  private readonly db: Loki;

  private readonly CONTAINERS_COLLECTION = "$CONTAINERS_COLLECTION$";
  private readonly SERVICE_PROPERTIES_COLLECTION =
    "$SERVICE_PROPERTIES_COLLECTION$";

  private SERVICE_PROPERTIES_DOCUMENT_LOKI_ID?: number;

  private readonly defaultServiceProperties = {
    cors: [],
    defaultServiceVersion: API_VERSION,
    hourMetrics: {
      enabled: false,
      retentionPolicy: {
        enabled: false
      },
      version: "1.0"
    },
    logging: {
      deleteProperty: true,
      read: true,
      retentionPolicy: {
        enabled: false
      },
      version: "1.0",
      write: true
    },
    minuteMetrics: {
      enabled: false,
      retentionPolicy: {
        enabled: false
      },
      version: "1.0"
    },
    staticWebsite: {
      enabled: false
    }
  };

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

    const statAsync = promisify(stat);
    const mkdirAsync = promisify(mkdir);
    try {
      await statAsync(this.persistencePath);
    } catch {
      await mkdirAsync(this.persistencePath);
    }

    // In loki DB implementation, these operations are all sync. Doesn't need an async lock
    // Create containers collection if not exists
    if (this.db.getCollection(this.CONTAINERS_COLLECTION) === null) {
      this.db.addCollection(this.CONTAINERS_COLLECTION, { unique: ["name"] });
    }

    // Create service properties collection if not exists
    let servicePropertiesColl = this.db.getCollection(
      this.SERVICE_PROPERTIES_COLLECTION
    );
    if (servicePropertiesColl === null) {
      servicePropertiesColl = this.db.addCollection(
        this.SERVICE_PROPERTIES_COLLECTION
      );
    }

    // Create default service properties document if not exists
    // Get SERVICE_PROPERTIES_DOCUMENT_LOKI_ID from DB if not exists
    const servicePropertiesDocs = servicePropertiesColl.where(() => true);
    if (servicePropertiesDocs.length === 0) {
      await this.setServiceProperties(this.defaultServiceProperties);
    } else if (servicePropertiesDocs.length === 1) {
      this.SERVICE_PROPERTIES_DOCUMENT_LOKI_ID = servicePropertiesDocs[0].$loki;
    } else {
      throw new Error(
        "LokiDB initialization error: Service properties collection has more than one document."
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
   * Update blob service properties. Create service properties document if not exists in DB.
   * Assume service properties collection has been created.
   *
   * @template T
   * @param {T} serviceProperties
   * @returns {Promise<T>}
   * @memberof LokiBlobDataStore
   */
  public async setServiceProperties<T extends Models.StorageServiceProperties>(
    serviceProperties: T
  ): Promise<T> {
    const coll = this.db.getCollection(this.SERVICE_PROPERTIES_COLLECTION);
    if (this.SERVICE_PROPERTIES_DOCUMENT_LOKI_ID !== undefined) {
      const existingDocument = coll.get(
        this.SERVICE_PROPERTIES_DOCUMENT_LOKI_ID
      );
      coll.remove(existingDocument);
    }

    const doc = coll.insert(serviceProperties);
    this.SERVICE_PROPERTIES_DOCUMENT_LOKI_ID = doc.$loki;
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
    T extends Models.StorageServiceProperties
  >(): Promise<T> {
    const coll = this.db.getCollection(this.SERVICE_PROPERTIES_COLLECTION);
    return coll.get(this.SERVICE_PROPERTIES_DOCUMENT_LOKI_ID!); // Only 1 document in service properties collection
  }

  /**
   * Get a container item from DB by container name.
   *
   * @template T
   * @param {string} container
   * @returns {Promise<T>}
   * @memberof LokiBlobDataStore
   */
  public async getContainer<T extends Models.ContainerItem>(
    container: string
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
  public async updateContainer<T extends Models.ContainerItem>(
    container: T
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
  public async listContainers<T extends Models.ContainerItem>(
    prefix: string = "",
    maxResults: number = 2000,
    marker: number = 0
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
   * For a update operation, blob item should be a valid loki DB document object
   * retrieved by calling getBlob().
   *
   * @template T A BlobItem model compatible object
   * @param {string} container Container name
   * @param {T} blob For a update operation, blob should be a valid loki DB document object retrieved by getBlob()
   * @returns {Promise<T>}
   * @memberof LokiBlobDataStore
   */
  public async updateBlob<T extends Models.BlobItem>(
    container: string,
    blob: T
  ): Promise<T> {
    const coll = this.db.getCollection(container);
    const blobDoc = coll.findOne({ name: { $eq: blob.name } });
    if (blobDoc !== undefined && blobDoc !== null) {
      return coll.update(blob);
    } else {
      return coll.insert(blob);
    }
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
  public async getBlob<T extends Models.BlobItem>(
    container: string,
    blob: string
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
   * Persist blob payload.
   *
   * @param {string} container
   * @param {string} blob
   * @param {NodeJS.ReadableStream} payload
   * @returns {Promise<void>}
   * @memberof IBlobDataStore
   */
  public async writeBlobPayload(
    container: string,
    blob: string,
    payload: NodeJS.ReadableStream
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // TODO: Create a class for mapping between blob with local disk file path
      const path = join(this.persistencePath, `${container}_${blob}`);
      const ws = createWriteStream(path);
      payload
        .pipe(ws)
        .on("close", resolve)
        .on("error", reject);
    });
  }

  /**
   * Read blob payload.
   *
   * @param {string} container
   * @param {string} blob
   * @returns {Promise<NodeJS.ReadableStream>}
   * @memberof IBlobDataStore
   */
  public async readBlobPayload(
    container: string,
    blob: string
  ): Promise<NodeJS.ReadableStream> {
    const path = join(this.persistencePath, `${container}_${blob}`);
    return createReadStream(path);
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
}
