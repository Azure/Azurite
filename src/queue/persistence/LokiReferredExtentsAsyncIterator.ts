import LokiqueueMetadataStore from "./LokiQueueMetadataStore";

/**
 * An async iterator which enumerates all extents being used.
 *
 * @export
 * @class LokiReferredExtentsAsyncIterator
 * @implements {AsyncIterator<string[]>}
 */
export default class LokiReferredExtentsAsyncIterator
  implements AsyncIterator<string[]> {
  private unit: number = 1000;
  private done: boolean = false;
  private marker?: number;

  constructor(private readonly queueMetadata: LokiqueueMetadataStore) {}

  public async next(): Promise<IteratorResult<string[]>> {
    if (this.done) {
      return { done: true, value: [] };
    }

    const [messages, nextMarker] = await this.queueMetadata.listMessages(
      this.unit,
      this.marker
    );
    this.marker = nextMarker;

    if (nextMarker === undefined) {
      this.done = true;
    }

    return {
      done: false,
      value: messages.map((val: any) => val.persistency.id)
    };
  }
}
