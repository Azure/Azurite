import ILogger from "../../common/ILogger";
import { Logger } from "../../common/Logger";
import NoLoggerStrategy from "../../common/NoLoggerStrategy";
import { IPersistencyChunk } from "./IBlobMetadataStore";
import IBlobMetadataStore from "./IBlobMetadataStore";

enum State {
  LISTING_EXTENTS_IN_BLOBS,
  LISTING_EXTENTS_IN_BLOCKS,
  DONE
}

/**
 * An async iterator which enumerates all extents being used.
 *
 * @export
 * @class BlobReferredExtentsAsyncIterator
 * @implements {AsyncIterator<IPersistencyChunk[]>}
 */
export default class BlobReferredExtentsAsyncIterator
  implements AsyncIterator<IPersistencyChunk[]> {
  private state: State = State.LISTING_EXTENTS_IN_BLOBS;

  private blobListingMarker: string | undefined;
  private blockListingMarker: string | undefined;

  constructor(
    private readonly blobMetadataStore: IBlobMetadataStore,
    private readonly logger: ILogger = new Logger(new NoLoggerStrategy())
  ) {}

  public async next(): Promise<IteratorResult<IPersistencyChunk[]>> {
    if (this.state === State.LISTING_EXTENTS_IN_BLOBS) {
      const [blobs, marker] = await this.blobMetadataStore.listBlobs(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        this.blobListingMarker,
        true
      );
      this.blobListingMarker = marker;
      if (marker === undefined) {
        this.state = State.LISTING_EXTENTS_IN_BLOCKS;
      }

      const extents = [];
      for (const blob of blobs) {
        this.logger.debug(
          `BlobReferredExtentsAsyncIterator:next() Handle blob ${
            blob.accountName
          } ${blob.containerName} ${blob.name} ${blob.snapshot} Blocks: ${
            (blob.committedBlocksInOrder || []).length
          } PageRanges: ${(blob.pageRangesInOrder || []).length} Persistency: ${
            blob.persistency ? blob.persistency.id : ""
          }`
        );

        for (const block of blob.committedBlocksInOrder || []) {
          extents.push(block.persistency);
        }
        for (const range of blob.pageRangesInOrder || []) {
          extents.push(range.persistency);
        }
        if (blob.persistency) {
          extents.push(blob.persistency);
        }
      }
      return {
        done: false,
        value: extents
      };
    } else if (this.state === State.LISTING_EXTENTS_IN_BLOCKS) {
      const [
        blocks,
        marker
      ] = await this.blobMetadataStore.listUncommittedBlockPersistencyChunks(
        this.blockListingMarker
      );
      this.blockListingMarker = marker;
      if (marker === undefined) {
        this.state = State.DONE;
      }

      this.logger.debug(
        `BlobReferredExtentsAsyncIterator:next() Handle blocks ${blocks.length}`
      );

      return {
        done: false,
        value: blocks
      };
    } else {
      return {
        done: true,
        value: []
      };
    }
  }
}
