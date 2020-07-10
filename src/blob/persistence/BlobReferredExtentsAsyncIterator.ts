import ILogger from "../../common/ILogger";
import { Logger } from "../../common/Logger";
import NoLoggerStrategy from "../../common/NoLoggerStrategy";
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
 * @implements {AsyncIterator<string[]>}
 */
export default class BlobReferredExtentsAsyncIterator
  implements AsyncIterator<string[]> {
  private state: State = State.LISTING_EXTENTS_IN_BLOBS;

  private blobListingMarker: string | undefined;
  private blockListingMarker: string | undefined;

  constructor(
    private readonly blobMetadataStore: IBlobMetadataStore,
    private readonly logger: ILogger = new Logger(new NoLoggerStrategy())
  ) {}

  public async next(): Promise<IteratorResult<string[]>> {
    if (this.state === State.LISTING_EXTENTS_IN_BLOBS) {
      const [blobs, marker] = await this.blobMetadataStore.listAllBlobs(
        undefined,
        this.blobListingMarker,
        true, // includeSnapshots
        true // includeUncommitedBlobs
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

        // this._logger.debug(
        //   `BlobReferredExtentsAsyncIterator:next() committedBlocksInOrder:${JSON.stringify(
        //     blob.committedBlocksInOrder
        //   )}`
        // );
        // this._logger.debug(
        //   `BlobReferredExtentsAsyncIterator:next() pageRangesInOrder:${JSON.stringify(
        //     blob.pageRangesInOrder
        //   )}`
        // );

        for (const block of blob.committedBlocksInOrder || []) {
          extents.push(block.persistency.id);
        }
        for (const range of blob.pageRangesInOrder || []) {
          extents.push(range.persistency.id);
        }
        if (blob.persistency) {
          extents.push(blob.persistency.id);
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

      // this._logger.debug(
      //   `BlobReferredExtentsAsyncIterator:next() Handle uncommitted blocks ${
      //     blocks.length
      //   } ${JSON.stringify(blocks)}`
      // );

      return {
        done: false,
        value: blocks.map(block => block.id)
      };
    } else {
      return {
        done: true,
        value: []
      };
    }
  }
}
