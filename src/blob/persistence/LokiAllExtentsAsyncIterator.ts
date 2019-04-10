import LokiBlobDataStore from "./LokiBlobDataStore";

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

  constructor(private readonly blobDataStore: LokiBlobDataStore) {}

  public async next(): Promise<IteratorResult<string[]>> {
    if (this.done) {
      return { done: true, value: [] };
    }

    const [extents, nextMarker] = await this.blobDataStore.listExtents(
      undefined,
      undefined,
      this.unit,
      this.marker
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
