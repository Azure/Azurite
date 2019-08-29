import {
  createReadStream,
  createWriteStream,
  mkdir,
  openSync,
  stat,
  unlink
} from "fs";
import { join } from "path";
import { promisify } from "util";

import ILogger from "../ILogger";
import BufferStream from "../utils/BufferStream";
import {
  DEFAULT_MAX_EXTENT_SIZE,
  DEFAULT_READ_CONCURRENCY
} from "../utils/constants";
import ZeroBytesStream from "../ZeroBytesStream";
import FDCache from "./FDCache";
import IExtentMetadata, { IExtentModel } from "./IExtentMetadata";
import IExtentStore, {
  IExtentChunk,
  StoreDestinationArray
} from "./IExtentStore";
import IFDCache from "./IFDCache";
import IOperationQueue from "./IOperationQueue";
import OperationQueue from "./OperationQueue";

import uuid = require("uuid");
const statAsync = promisify(stat);
const mkdirAsync = promisify(mkdir);
const unlinkAsync = promisify(unlink);

// The max size of an extent.
const MAX_EXTENT_SIZE = DEFAULT_MAX_EXTENT_SIZE;

enum AppendStatusCode {
  Idle,
  Appending
}

interface IAppendExtent {
  id: string;
  offset: number;
  appendStatus: AppendStatusCode; // 0 for idle, 1 for appeding
  persistencyId: string;
}

// const openAsync = promisify(open);

/**
 * Persistency layer data store source implementation interacting with the storage media.
 * It provides the methods to read and write data with the storage.
 *
 * @export
 * @class FSExtentStore
 * @implements {IExtentStore}
 */
export default class FSExtentStore implements IExtentStore {
  private readonly metadataStore: IExtentMetadata;
  private readonly appendQueue: IOperationQueue;
  private readonly readQueue: IOperationQueue;
  private readonly fdCache: IFDCache;

  private initialized: boolean = false;
  private closed: boolean = false;

  // The current extents to be appended data.
  private appendExtentArray: IAppendExtent[];
  private appendExtentNumber: number;

  private persistencyPath: Map<string, string>;

  public constructor(
    metadata: IExtentMetadata,
    private readonly persistencyConfiguration: StoreDestinationArray,
    private readonly logger: ILogger
  ) {
    this.appendExtentArray = [];
    this.persistencyPath = new Map<string, string>();
    this.fdCache = new FDCache(100);

    for (const storeDestination of persistencyConfiguration) {
      this.persistencyPath.set(
        storeDestination.persistencyId,
        storeDestination.persistencyPath
      );
      for (let i = 0; i < storeDestination.maxConcurrency; i++) {
        const appendExtent = this.createAppendExtent(
          storeDestination.persistencyId
        );
        this.appendExtentArray.push(appendExtent);
      }
    }
    this.appendExtentNumber = this.appendExtentArray.length;

    this.metadataStore = metadata;
    this.appendQueue = new OperationQueue(this.appendExtentNumber, logger);
    // TODO:Should add to interface to pass this parameter.
    this.readQueue = new OperationQueue(DEFAULT_READ_CONCURRENCY, logger);
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public isClosed(): boolean {
    return this.closed;
  }

  public async init(): Promise<void> {
    for (const storeDestination of this.persistencyConfiguration) {
      try {
        await statAsync(storeDestination.persistencyPath);
      } catch {
        await mkdirAsync(storeDestination.persistencyPath);
      }
    }

    if (!this.metadataStore.isInitialized()) {
      await this.metadataStore.init();
    }

    if (!this.fdCache.isInitialized()) {
      await this.fdCache.init();
    }

    this.initialized = true;
    this.closed = false;
  }

  public async close(): Promise<void> {
    if (!this.fdCache.isClosed()) {
      await this.fdCache.close();
    }

    if (!this.metadataStore.isClosed()) {
      await this.metadataStore.close();
    }

    this.closed = true;
  }

  /**
   * This method MAY create a new extent or append data to an existing extent
   * Return the extent chunk information including the extentId, offset and count.
   *
   * @param {NodeJS.ReadableStream | Buffer} data
   * @returns {Promise<IExtentChunk>}
   * @memberof IExtentStore
   */
  public async appendExtent(
    data: NodeJS.ReadableStream | Buffer
  ): Promise<IExtentChunk> {
    const op = () =>
      new Promise<IExtentChunk>((resolve, reject) => {
        (async (): Promise<IExtentChunk> => {
          let appendExtentIdx = 0;

          for (let i = 1; i < this.appendExtentNumber; i++) {
            if (
              this.appendExtentArray[i].appendStatus === AppendStatusCode.Idle
            ) {
              appendExtentIdx = i;
              break;
            }
          }
          this.appendExtentArray[appendExtentIdx].appendStatus =
            AppendStatusCode.Appending;

          this.logger.info(
            `appendExtent() appendExtentIdx:${appendExtentIdx} offset:${
              this.appendExtentArray[appendExtentIdx].offset
            } MAX_EXTENT_SIZE:${MAX_EXTENT_SIZE} extentId:${
              this.appendExtentArray[appendExtentIdx].id
            }`
          );

          if (
            this.appendExtentArray[appendExtentIdx].offset > MAX_EXTENT_SIZE
          ) {
            this.getNewExtent(this.appendExtentArray[appendExtentIdx]);
            this.logger.info(
              `appendExtent() After get new extent: appendExtentIdx:${appendExtentIdx} offset:${
                this.appendExtentArray[appendExtentIdx].offset
              } MAX_EXTENT_SIZE:${MAX_EXTENT_SIZE} extentId:${
                this.appendExtentArray[appendExtentIdx].id
              }`
            );
          }

          let rs: NodeJS.ReadableStream;
          if (data instanceof Buffer) {
            rs = new BufferStream(data);
          } else {
            rs = data;
          }

          const appendExtent = this.appendExtentArray[appendExtentIdx];
          const id = appendExtent.id;
          const path = this.generateExtentPath(appendExtent.persistencyId, id);

          let fd = this.fdCache.get(id);
          this.logger.debug(`appendExtent()  extentId:${id}. Get fd:${fd}`);
          if (fd === undefined) {
            fd = openSync(path, "a");
            this.fdCache.insert(id, fd);
            this.logger.debug(
              `appendExtent()  extentId:${id}. Get new fd:${fd}`
            );
          }

          const ws = createWriteStream(path, {
            flags: "a",
            fd,
            autoClose: false
          });

          let count = 0;

          this.logger.debug(`appendExtent() start writing. extentId:${id}`);

          try {
            count = await this.streamPipe(rs, ws);
            const offset = appendExtent.offset;
            appendExtent.offset += count;

            const extent: IExtentModel = {
              id,
              persistencyId: appendExtent.persistencyId,
              path: id,
              size: count + offset,
              LastModifyInMS: Date.now()
            };
            this.logger.debug(
              `appendExtent() write finish. extent:${JSON.stringify(extent)}`
            );
            await this.metadataStore.updateExtent(extent);

            this.logger.debug(`appendExtent() update extent done. Resolve()`);
            appendExtent.appendStatus = AppendStatusCode.Idle;
            return {
              id,
              offset,
              count
            };
          } catch (err) {
            appendExtent.appendStatus = AppendStatusCode.Idle;
            throw err;
          }
        })()
          .then(resolve)
          .catch(reject);
      });

    return this.appendQueue.operate(op);
  }

  /**
   * Read data from persistency layer accoding to the given IExtentChunk.
   *
   * @param {string} persistency
   * @returns {Promise<string>}
   * @memberof IExtentStore
   */
  public async readExtent(
    extentChunk: IExtentChunk
  ): Promise<NodeJS.ReadableStream> {
    if (extentChunk.count === 0) {
      return new ZeroBytesStream(0);
    }

    const persistencyId = await this.metadataStore.getExtentPersistencyId(
      extentChunk.id
    );

    const path = this.generateExtentPath(persistencyId, extentChunk.id);

    this.logger.info(
      `readExtent() prepare reading. extentId:${extentChunk.id} offset:${
        extentChunk.offset
      } count:${extentChunk.count}`
    );

    const op = () =>
      new Promise<NodeJS.ReadableStream>((resolve, reject) => {
        this.logger.debug(
          `readExtent() start reading. extentId:${extentChunk.id} offset:${
            extentChunk.offset
          } count:${extentChunk.count}`
        );
        resolve(
          createReadStream(path, {
            start: extentChunk.offset,
            end: extentChunk.offset + extentChunk.count - 1
          })
        );
        this.logger.debug(
          `readExtent() reading done. extentId:${extentChunk.id} offset:${
            extentChunk.offset
          } count:${extentChunk.count}`
        );
      });

    return this.readQueue.operate(op);
  }

  /**
   * Delete the extents from persistency layer.
   *
   * @param {Iterable<string>} persistency
   * @returns {Promise<void>}
   * @memberof IExtentStore
   */
  public async deleteExtents(extents: Iterable<string>): Promise<void> {
    for (const id of extents) {
      const persistencyId = await this.metadataStore.getExtentPersistencyId(id);
      const path = this.generateExtentPath(persistencyId, id);

      try {
        await unlinkAsync(path);
        await this.metadataStore.deleteExtent(id);
      } catch (err) {
        if (err.code === "ENOENT") {
          await this.metadataStore.deleteExtent(id);
        }
      }
    }
    return;
  }

  /**
   * Return its metadata store.
   *
   * @returns {IExtentMetadata}
   * @memberof IExtentStore
   */
  public getMetadataStore(): IExtentMetadata {
    return this.metadataStore;
  }

  private async streamPipe(
    rs: NodeJS.ReadableStream,
    ws: NodeJS.WritableStream
  ): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      let count: number = 0;
      rs.on("data", data => {
        count += data.length;
      })
        .pipe(ws)
        .on("finish", () => resolve(count))
        .on("error", reject);
    });
  }

  /**
   * Create a new append extent model for a new write directory.
   *
   * @private
   * @param {string} persistencyPath
   * @returns {IAppendExtent}
   * @memberof FSExtentStore
   */
  private createAppendExtent(persistencyId: string): IAppendExtent {
    return {
      id: uuid(),
      offset: 0,
      appendStatus: AppendStatusCode.Idle,
      persistencyId
    };
  }

  /**
   * Select a new extent to append for an exist write directory.
   *
   * @private
   * @param {IAppendExtent} appendExtent
   * @memberof FSExtentStore
   */
  private getNewExtent(appendExtent: IAppendExtent) {
    appendExtent.id = uuid();
    appendExtent.offset = 0;
  }

  /**
   * Generate the file path for a new extent.
   *
   * @private
   * @param {string} extentId
   * @returns {string}
   * @memberof FSExtentStore
   */
  private generateExtentPath(persistencyId: string, extentId: string): string {
    const directoryPath = this.persistencyPath.get(persistencyId);
    if (!directoryPath) {
      // To be completed
    }
    return join(directoryPath!, extentId);
  }
}
