import { DEFAULT_EXTENT_GC_PROTECT_TIME_IN_MS } from "../utils/constants";
import IExtentMetadataStore from "./IExtentMetadataStore";

/**
 * Async iterator to enumerate all extent IDs.
 *
 * @export
 * @class AllExtentsAsyncIterator
 * @implements {AsyncIterator<string[]>}
 */
export default class AllExtentsAsyncIterator
  implements AsyncIterator<string[]> {
  private unit: number = 1000;
  private done: boolean = false;
  private marker?: number;
  private readonly time: Date;

  constructor(private readonly extentMetadata: IExtentMetadataStore) {
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
      DEFAULT_EXTENT_GC_PROTECT_TIME_IN_MS
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
