import { DEFAULT_GC_UNMODIFIED_TIME } from "../utils/constants";
import LokiExtentMetadata from "./LokiExtentMetadata";

/**
 * Async iterator to enumerate all extent IDs.
 *
 * @export
 * @class LokiAllExtentsAsyncIterator
 * @implements {AsyncIterator<string[]>}
 */
export default class LokiAllExtentsAsyncIterator
  implements AsyncIterator<string[]> {
  private unit: number = 1000;
  private done: boolean = false;
  private marker?: number;
  private readonly time: Date;

  constructor(private readonly extentMetadata: LokiExtentMetadata) {
    this.time = new Date();
  }

  public async next(): Promise<IteratorResult<string[]>> {
    if (this.done) {
      return { done: true, value: [] };
    }

    const [extents, nextMarker] = await this.extentMetadata.listExtents(
      undefined,
      this.unit,
      this.marker,
      this.time,
      DEFAULT_GC_UNMODIFIED_TIME
    );
    this.marker = nextMarker;

    if (nextMarker === undefined) {
      this.done = true;
    }

    return {
      done: false,
      value: extents.map(val => val.id)
    };
  }
}
