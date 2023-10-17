import { ZERO_EXTENT_ID } from "../../blob/persistence/IBlobMetadataStore";
import ILogger from "../ILogger";
import ZeroBytesStream from "../ZeroBytesStream";
import IExtentMetadataStore, { IExtentModel } from "./IExtentMetadataStore";
import IExtentStore, { IExtentChunk } from "./IExtentStore";
import uuid = require("uuid");
import multistream = require("multistream");
import { Readable } from "stream";

export interface IMemoryExtentChunk extends IExtentChunk {
  chunks: (Buffer | string)[]
}

export default class MemoryExtentStore implements IExtentStore {
  private readonly metadataStore: IExtentMetadataStore;
  private readonly logger: ILogger;
  private readonly chunks: Map<string, IMemoryExtentChunk> = new Map<string, IMemoryExtentChunk>();
  private totalSize: number = 0;

  private initialized: boolean = false;
  private closed: boolean = true;

  public constructor(
    metadata: IExtentMetadataStore,
    logger: ILogger
  ) {
    this.metadataStore = metadata;
    this.logger = logger;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public isClosed(): boolean {
    return this.closed;
  }

  async init(): Promise<void> {
    if (!this.metadataStore.isInitialized()) {
      await this.metadataStore.init();
    }

    this.initialized = true;
    this.closed = false;
  }

  public async close(): Promise<void> {
    if (!this.metadataStore.isClosed()) {
      await this.metadataStore.close();
    }

    this.closed = true;
  }

  public async clean(): Promise<void> {
    if (this.isClosed()) {
      this.chunks.clear();
      return;
    }
    throw new Error(`Cannot clean MemoryExtentStore, it's not closed.`);
  }

  async appendExtent(data: NodeJS.ReadableStream | Buffer, contextId?: string | undefined): Promise<IExtentChunk> {
    const chunks: (Buffer | string)[] = []
    let count = 0;
    if (data instanceof Buffer) {
      if (data.length > 0) {
        chunks.push(data)
        count = data.length
      }
    } else {
      for await (let chunk of data) {
        if (chunk.length > 0) {
          chunks.push(chunk)
          count += chunk.length
        }
      }
    }
    const extentChunk: IMemoryExtentChunk = {
      count,
      offset: 0,
      id: uuid(),
      chunks
    }

    this.logger.info(
      `MemoryExtentStore:appendExtent() Add chunks to in-memory map. id:${extentChunk.id} count:${count} chunks.length:${chunks.length}`,
      contextId
    );

    this.chunks.set(extentChunk.id, extentChunk);
    this.totalSize += count

    this.logger.debug(
      `MemoryExtentStore:appendExtent() Added chunks to in-memory map. id:${extentChunk.id} `,
      contextId
    );

    const extent: IExtentModel = {
      id: extentChunk.id,
      locationId: extentChunk.id,
      path: extentChunk.id,
      size: count,
      lastModifiedInMS: Date.now()
    };

    await this.metadataStore.updateExtent(extent);

    this.logger.debug(
      `MemoryExtentStore:appendExtent() Added new extent to metadata store. id:${extentChunk.id}`,
      contextId
    );

    return extentChunk
  }

  async readExtent(extentChunk?: IExtentChunk | undefined, contextId?: string | undefined): Promise<NodeJS.ReadableStream> {
    if (extentChunk === undefined || extentChunk.count === 0) {
      return new ZeroBytesStream(0);
    }

    if (extentChunk.id === ZERO_EXTENT_ID) {
      const subRangeCount = Math.min(extentChunk.count);
      return new ZeroBytesStream(subRangeCount);
    }

    this.logger.info(
      `MemoryExtentStore:readExtent() Fetch chunks from in-memory map. id:${extentChunk.id}`,
      contextId
    );

    const match = this.chunks.get(extentChunk.id);
    if (!match) {
      throw new Error(`Extend ${extentChunk.id} does not exist.`);
    }

    this.logger.debug(
      `MemoryExtentStore:readExtent() Fetched chunks from in-memory map. id:${match.id} count:${match.count} chunks.length:${match.chunks.length} totalSize:${this.totalSize}`,
      contextId
    );

    const buffer = new Readable()
    let skip = extentChunk.offset;
    let take = extentChunk.count;
    let skippedChunks = 0;
    let partialChunks = 0;
    let readChunks = 0;
    for (const chunk of match.chunks) {
      if (take === 0) {
        break
      }

      if (skip > 0) {
        if (chunk.length <= skip) {
          // this chunk is entirely skipped
          skip -= chunk.length
          skippedChunks++
        } else {
          // part of the chunk is included
          const end = skip + Math.min(take, chunk.length - skip)
          const slice = chunk.slice(skip, end);
          buffer.push(chunk.slice(skip, end))
          skip = 0
          take -= slice.length
          partialChunks++
        }
      } else {
        if (chunk.length > take) {
          // all of the chunk is included, up to the count limit
          const slice = chunk.slice(0, take);
          buffer.push(slice)
          take -= slice.length
          partialChunks++
        } else {
          // all of the chunk is included
          buffer.push(chunk)
          take -= chunk.length
          readChunks++
        }
      }
    }
    buffer.push(null)

    this.logger.debug(
      `MemoryExtentStore:readExtent() Pushed in-memory chunks to Readable stream. id:${match.id} chunks:${readChunks} skipped:${skippedChunks} partial:${partialChunks}`,
      contextId
    );

    return buffer;
  }

  async readExtents(extentChunkArray: IExtentChunk[], offset: number, count: number, contextId?: string | undefined): Promise<NodeJS.ReadableStream> {
    this.logger.info(
      `MemoryExtentStore:readExtents() Start read from multi extents...`,
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

  async deleteExtents(extents: Iterable<string>): Promise<number> {
    let count = 0;
    for (const id of extents) {
      this.logger.info(
        `MemoryExtentStore:deleteExtents() Delete extent:${id}`
      );
      const extent = this.chunks.get(id)
      if (extent) {
        this.chunks.delete(id)
        this.totalSize -= extent.count
      }
      await this.metadataStore.deleteExtent(id);
      this.logger.debug(
        `MemoryExtentStore:deleteExtents() Deleted extent:${id} totalSize:${this.totalSize}`
      );
      count++;
    }
    return count;
  }

  getMetadataStore(): IExtentMetadataStore {
    return this.metadataStore;
  }
}