import {
  createReadStream,
  createWriteStream,
  mkdir,
  openSync,
  stat,
  unlink
} from "fs";
import multistream = require("multistream");
import { join } from "path";
import { Writable } from "stream";
import { promisify } from "util";
import uuid = require("uuid");

import { ZERO_EXTENT_ID } from "../../blob/persistence/IBlobMetadataStore";
import ILogger from "../ILogger";
import BufferStream from "../utils/BufferStream";
import {
  DEFAULT_MAX_EXTENT_SIZE,
  DEFAULT_READ_CONCURRENCY
} from "../utils/constants";
import { rimrafAsync } from "../utils/utils";
import ZeroBytesStream from "../ZeroBytesStream";
import FDCache from "./FDCache";
import IExtentMetadataStore, { IExtentModel } from "./IExtentMetadataStore";
import IExtentStore, {
  IExtentChunk,
  StoreDestinationArray
} from "./IExtentStore";
import IFDCache from "./IFDCache";
import IOperationQueue from "./IOperationQueue";
import OperationQueue from "./OperationQueue";

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
  private readonly metadataStore: IExtentMetadataStore;
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
    metadata: IExtentMetadataStore,
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

  public async clean(): Promise<void> {
    if (this.isClosed()) {
      for (const path of this.persistencyConfiguration) {
        try {
          await rimrafAsync(path.persistencyPath);
        } catch {
          // TODO: Find out why sometimes it throws no permission error
          /* NOOP */
        }
      }
      return;
    }
    throw new Error(`Cannot clean FSExtentStore, it's not closed.`);
  }

  /**
   * This method may create a new extent or append data to an existing extent.
   * Return the extent chunk information including the extentId, offset and count.
   *
   * @param {(NodeJS.ReadableStream | Buffer)} data
   * @param {string} [contextId]
   * @returns {Promise<IExtentChunk>}
   * @memberof FSExtentStore
   */
  public async appendExtent(
    data: NodeJS.ReadableStream | Buffer,
    contextId?: string
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
            `FSExtentStore:appendExtent() Select extent from idle location for extent append operation. LocationId:${appendExtentIdx} extentId:${this.appendExtentArray[appendExtentIdx].id} offset:${this.appendExtentArray[appendExtentIdx].offset} MAX_EXTENT_SIZE:${MAX_EXTENT_SIZE} `,
            contextId
          );

          if (
            this.appendExtentArray[appendExtentIdx].offset > MAX_EXTENT_SIZE
          ) {
            this.getNewExtent(this.appendExtentArray[appendExtentIdx]);
            this.logger.info(
              `FSExtentStore:appendExtent() Size of selected extent offset is larger than maximum extent size ${MAX_EXTENT_SIZE} bytes, try appending to new extent. New extent LocationID:${appendExtentIdx} extentId:${this.appendExtentArray[appendExtentIdx].id} offset:${this.appendExtentArray[appendExtentIdx].offset} MAX_EXTENT_SIZE:${MAX_EXTENT_SIZE} `,
              contextId
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
          this.logger.debug(
            `FSExtentStore:appendExtent() Get fd:${fd} for extent:${id} from cache.`,
            contextId
          );
          if (fd === undefined) {
            fd = openSync(path, "a"); // TODO: async
            this.fdCache.insert(id, fd);
            this.logger.debug(
              `FSExtentStore:appendExtent() Open file:${path} for extent:${id}, get new fd:${fd}`,
              contextId
            );
          }

          const ws = createWriteStream(path, {
            flags: "a",
            fd,
            autoClose: false
          });

          let count = 0;

          this.logger.debug(
            `FSExtentStore:appendExtent() Start writing to extent ${id}`,
            contextId
          );

          try {
            count = await this.streamPipe(rs, ws);
            const offset = appendExtent.offset;
            appendExtent.offset += count;

            const extent: IExtentModel = {
              id,
              persistencyId: appendExtent.persistencyId,
              path: id,
              size: count + offset,
              lastModifiedInMS: Date.now()
            };
            this.logger.debug(
              `FSExtentStore:appendExtent() Write finish, start updating extent metadata. extent:${JSON.stringify(
                extent
              )}`,
              contextId
            );
            await this.metadataStore.updateExtent(extent);

            this.logger.debug(
              `FSExtentStore:appendExtent() Update extent metadata done. Resolve()`,
              contextId
            );
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

    return this.appendQueue.operate(op, contextId);
  }

  /**
   * Read data from persistency layer according to the given IExtentChunk.
   *
   * @param {IExtentChunk} [extentChunk]
   * @returns {Promise<NodeJS.ReadableStream>}
   * @memberof FSExtentStore
   */
  public async readExtent(
    extentChunk?: IExtentChunk,
    contextId?: string
  ): Promise<NodeJS.ReadableStream> {
    if (extentChunk === undefined || extentChunk.count === 0) {
      return new ZeroBytesStream(0);
    }

    if (extentChunk.id === ZERO_EXTENT_ID) {
      const subRangeCount = Math.min(extentChunk.count);
      return new ZeroBytesStream(subRangeCount);
    }

    const persistencyId = await this.metadataStore.getExtentPersistencyId(
      extentChunk.id
    );

    const path = this.generateExtentPath(persistencyId, extentChunk.id);

    const op = () =>
      new Promise<NodeJS.ReadableStream>((resolve, reject) => {
        this.logger.verbose(
          `FSExtentStore:readExtent() Creating read stream. LocationId:${persistencyId} extentId:${
            extentChunk.id
          } path:${path} offset:${extentChunk.offset} count:${
            extentChunk.count
          } end:${extentChunk.offset + extentChunk.count - 1}`,
          contextId
        );
        const stream = createReadStream(path, {
          start: extentChunk.offset,
          end: extentChunk.offset + extentChunk.count - 1
        }).on("close", () => {
          this.logger.verbose(
            `FSExtentStore:readExtent() Read stream closed. LocationId:${persistencyId} extentId:${
              extentChunk.id
            } path:${path} offset:${extentChunk.offset} count:${
              extentChunk.count
            } end:${extentChunk.offset + extentChunk.count - 1}`,
            contextId
          );
        });
        resolve(stream);
      });

    return this.readQueue.operate(op, contextId);
  }

  /**
   * Merge several extent chunks to a ReadableStream according to the offset and count.
   *
   * @param {(IExtentChunk)[]} extentChunkArray
   * @param {number} [offset=0]
   * @param {number} [count=Infinity]
   * @param {string} [contextId]
   * @returns {Promise<NodeJS.ReadableStream>}
   * @memberof FSExtentStore
   */
  public async readExtents(
    extentChunkArray: (IExtentChunk)[],
    offset: number = 0,
    count: number = Infinity,
    contextId?: string
  ): Promise<NodeJS.ReadableStream> {
    this.logger.verbose(
      `FSExtentStore:readExtents() Start read from multi extents...`,
      contextId
    );

    if (count === 0) {
      return new ZeroBytesStream(0);
    }

    const start = offset; // Start inclusive position in the merged stream
    const end = offset + count; // End exclusive position in the merged stream

    const streams: NodeJS.ReadableStream[] = [];
    let accumulatedOffset = 0; // Current payload offset in the merged stream

    for (const chunk of extentChunkArray) {
      const nextOffset = accumulatedOffset + chunk.count;

      if (nextOffset <= start) {
        accumulatedOffset = nextOffset;
        continue;
      } else if (end <= accumulatedOffset) {
        break;
      } else {
        let chunkStart = chunk.offset;
        let chunkEnd = chunk.offset + chunk.count;
        if (start > accumulatedOffset) {
          chunkStart = chunkStart + start - accumulatedOffset; // Inclusive
        }

        if (end <= nextOffset) {
          chunkEnd = chunkEnd - (nextOffset - end); // Exclusive
        }

        streams.push(
          await this.readExtent(
            {
              id: chunk.id,
              offset: chunkStart,
              count: chunkEnd - chunkStart
            },
            contextId
          )
        );
        accumulatedOffset = nextOffset;
      }
    }

    // TODO: What happens when count exceeds merged payload length?
    // throw an error of just return as much data as we can?
    if (end !== Infinity && accumulatedOffset < end) {
      throw new RangeError(
        // tslint:disable-next-line:max-line-length
        `Not enough payload data error. Total length of payloads is ${accumulatedOffset}, while required data offset is ${offset}, count is ${count}.`
      );
    }

    return multistream(streams);
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
   * @returns {IExtentMetadataStore}
   * @memberof IExtentStore
   */
  public getMetadataStore(): IExtentMetadataStore {
    return this.metadataStore;
  }

  private async streamPipe(
    rs: NodeJS.ReadableStream,
    ws: Writable
  ): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      let count: number = 0;
      let wsEnd = false;

      rs.on("data", data => {
        count += data.length;
        if (!ws.write(data)) {
          rs.pause();
        }
      })
        .on("end", () => {
          if (!wsEnd) {
            ws.end();
            wsEnd = true;
          }
        })
        .on("close", () => {
          if (!wsEnd) {
            ws.end();
            wsEnd = true;
          }
        })
        .on("error", err => {
          ws.destroy(err);
        });

      ws.on("drain", () => {
        rs.resume();
      })
        .on("finish", () => {
          resolve(count);
        })
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
