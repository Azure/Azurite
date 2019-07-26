import {
  createReadStream,
  createWriteStream,
  mkdir,
  open,
  stat,
  unlink
} from "fs";
import { join } from "path";
import { Writable } from "stream";
import { promisify } from "util";

import { ZERO_PERSISTENCY_CHUNK_ID } from "../../blob/persistence/IBlobDataStore";
import BufferStream from "../utils/BufferStream";
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

import multistream = require("multistream");
import uuid = require("uuid");
const statAsync = promisify(stat);
const mkdirAsync = promisify(mkdir);
const unlinkAsync = promisify(unlink);
const openAsync = promisify(open);

// The max size of an extent.
const MAX_EXTENT_SIZE = 8 * 1024 * 1024;
const DEFAULT_READ_CONCURRENCY = 100;

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
    public readonly persistencyConfiguration: StoreDestinationArray
  ) {
    this.appendExtentArray = [];
    this.persistencyPath = new Map<string, string>();
    this.fdCache = new FDCache(100);

    for (const storeDestination of persistencyConfiguration) {
      this.persistencyPath.set(
        storeDestination.persistenceId,
        storeDestination.persistencePath
      );
      for (let i = 0; i < storeDestination.maxConcurrency; i++) {
        const appendExtent = this.createAppendExtent(
          storeDestination.persistenceId
        );
        this.appendExtentArray.push(appendExtent);
        // console.log(appendExtent.id);
      }
    }
    this.appendExtentNumber = this.appendExtentArray.length;

    this.metadataStore = metadata;
    this.appendQueue = new OperationQueue(this.appendExtentNumber);
    this.readQueue = new OperationQueue(DEFAULT_READ_CONCURRENCY); // Should add to interface to pass this parameter
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
        await statAsync(storeDestination.persistencePath);
      } catch {
        await mkdirAsync(storeDestination.persistencePath);
      }
    }

    if (!this.metadataStore.isInitialized()) {
      // console.log(`FSExtentStore.init() this.metadataStore init.`);
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

          for (let i = 0; i < this.appendExtentNumber; i++) {
            if (
              this.appendExtentArray[i].appendStatus === AppendStatusCode.Idle
            ) {
              appendExtentIdx = i;
              break;
            }
          }
          this.appendExtentArray[appendExtentIdx].appendStatus =
            AppendStatusCode.Appending;

          // console.log(
          //   `appendExtent() appendExtentIdx:${appendExtentIdx} offset:${
          //     this.appendExtentArray[appendExtentIdx].offset
          //   } MAX_EXTENT_SIZE:${MAX_EXTENT_SIZE} extentId:${
          //     this.appendExtentArray[appendExtentIdx].id
          //   }`
          // );
          if (
            this.appendExtentArray[appendExtentIdx].offset > MAX_EXTENT_SIZE
          ) {
            this.getNewExtent(this.appendExtentArray[appendExtentIdx]);
            // console.log(
            //   `appendExtent() After get new extent: appendExtentIdx:${appendExtentIdx} offset:${
            //     this.appendExtentArray[appendExtentIdx].offset
            //   } MAX_EXTENT_SIZE:${MAX_EXTENT_SIZE} extentId:${
            //     this.appendExtentArray[appendExtentIdx].id
            //   }`
            // );
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
          // console.log(`appendExtent()  extentId:${id}. Get fd:${fd}`);
          if (fd === undefined) {
            fd = await openAsync(path, "a");
            this.fdCache.insert(id, fd);
            // console.log(`appendExtent()  extentId:${id}. Get new fd:${fd}`);
          }

          const ws = createWriteStream(path, {
            flags: "a",
            fd,
            autoClose: false
          });

          // const ws = createWriteStream(path, { flags: "a" });
          let count = 0;

          // console.log(`appendExtent() start writing. extentId:${id}`);

          try {
            count = await this.streamPipe(rs, ws);
            const offset = appendExtent.offset;
            appendExtent.offset += count;

            const extentId = id;
            const extent: IExtentModel = {
              id: extentId,
              persistencyId: appendExtent.persistencyId,
              path: extentId,
              size: count + offset,
              lastModifiedInMS: Date.now()
            };
            // console.log(
            //   `appendExtent() write finish. extent:${JSON.stringify(extent)}`
            // );
            await this.metadataStore.updateExtent(extent);

            // console.log(`appendExtent() update extent done. Resolve()`);
            appendExtent.appendStatus = AppendStatusCode.Idle;
            return {
              id,
              offset,
              count
            };
          } catch (err) {
            this.getNewExtent(appendExtent);
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
   * @param {string} [persistency]
   * @returns {Promise<string>}
   * @memberof IExtentStore
   */
  public async readExtent(
    extentChunk?: IExtentChunk
  ): Promise<NodeJS.ReadableStream> {
    if (extentChunk === undefined || extentChunk.count === 0) {
      return new ZeroBytesStream(0);
    }

    if (extentChunk.id === ZERO_PERSISTENCY_CHUNK_ID) {
      const subRangeCount = Math.min(extentChunk.count);
      return new ZeroBytesStream(subRangeCount);
    }

    const persistencyId = await this.metadataStore.getExtentPersistencyId(
      extentChunk.id
    );

    const path = this.generateExtentPath(persistencyId, extentChunk.id);

    // console.log(
    //   `readExtent() prepare reading. extentId:${extentChunk.id} offset:${
    //     extentChunk.offset
    //   } count:${extentChunk.count}`
    // );

    const op = () =>
      new Promise<NodeJS.ReadableStream>((resolve, reject) => {
        // console.log(
        //   `readExtent() start reading. extentId:${extentChunk.id} offset:${
        //     extentChunk.offset
        //   } count:${extentChunk.count}`
        // );
        resolve(
          createReadStream(path, {
            start: extentChunk.offset,
            end: extentChunk.offset + extentChunk.count - 1
          })
        );
        // console.log(
        //   `readExtent() reading done. extentId:${extentChunk.id} offset:${
        //     extentChunk.offset
        //   } count:${extentChunk.count}`
        // );
      });

    return this.readQueue.operate(op);
  }

  /**
   * Merge serveral extent chunks to a ReadableStream according to the offset and count.
   *
   * @param {(IExtentChunk)[]} extentChunkArray
   * @param {number} [offset=0]
   * @param {number} [count=Infinity]
   * @returns {Promise<NodeJS.ReadableStream>}
   * @memberof FSExtentStore
   */
  public async readExtents(
    extentChunkArray: (IExtentChunk)[],
    offset: number = 0,
    count: number = Infinity
  ): Promise<NodeJS.ReadableStream> {
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
          chunkEnd = chunkEnd - (end - nextOffset); // Exclusive
        }

        streams.push(
          await this.readExtent({
            id: chunk.id,
            offset: chunkStart,
            count: chunkEnd - chunkStart
          })
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
          // console.log(`streamPipe(): finish with count:${count}`);
          resolve(count);
        })
        .on("error", reject);

      // rs.on("data", data => {
      //   count += data.length;
      // })
      //   .on("end", () => {
      //     // console.log(`streamPipe(): end with count:${count}`);
      //   })
      //   .on("close", () => {
      //     // console.log(`streamPipe(): rs close.`);
      //     ws.emit("finish");
      //   })
      //   .on("error", err => {
      //     // console.log(`streamPipe(): rs error ${err}`);
      //     ws.emit("error", err);
      //   })
      //   .pipe(ws)

      //   .on("finish", () => {
      //     // console.log(`streamPipe(): finish with count:${count}`);
      //     resolve(count);
      //   })
      //   .on("error", reject);
    });
  }

  /**
   * Create a new append extent model for a new write directory.
   *
   * @private
   * @param {string} persistencyPath
   * @returns {AppendExtent}
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
   * @param {AppendExtent} appendExtent
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
