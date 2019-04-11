import { IPersistencyChunk } from "./IBlobDataStore";
import LokiBlobDataStore from "./LokiBlobDataStore";

enum State {
  LISTING_EXTENTS_IN_BLOBS,
  LISTING_EXTENTS_IN_BLOCKS,
  DONE
}

/**
 * An async iterator which enumerates all extents being used.
 *
 * @export
 * @class LokiReferredExtentsAsyncIterator
 * @implements {AsyncIterator<IPersistencyChunk[]>}
 */
export default class LokiReferredExtentsAsyncIterator
  implements AsyncIterator<IPersistencyChunk[]> {
  private state: State = State.LISTING_EXTENTS_IN_BLOBS;

  private blobListingMarker: number | undefined;

  constructor(private readonly blobDataStore: LokiBlobDataStore) {}

  public async next(): Promise<IteratorResult<IPersistencyChunk[]>> {
    if (this.state === State.LISTING_EXTENTS_IN_BLOBS) {
      const [blobs, marker] = await this.blobDataStore.listBlobs(
        undefined,
        undefined,
        undefined,
        undefined,
        this.blobListingMarker
      );
      if (marker === undefined) {
        this.blobListingMarker = undefined;
        this.state = State.LISTING_EXTENTS_IN_BLOCKS;
      }

      const extents = [];
      for (const blob of blobs) {
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
      // TODO: Make listBlocks operation segment
      const blocks = await this.blobDataStore.listBlocks();
      this.state = State.DONE;
      return {
        done: false,
        value: blocks.map(value => value.persistency)
      };
    } else {
      return {
        done: true,
        value: []
      };
    }
  }
}
