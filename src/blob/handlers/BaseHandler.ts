import IExtentStore from "../../common/persistence/IExtentStore";
import { createBlobEvent } from "../events/BlobEventFactory";
import { BlobEventType, IBlobEventProps } from "../events/IBlobEvent";
import IBlobEventSink from "../events/IBlobEventSink";
import Context from "../generated/Context";
import ILogger from "../generated/utils/ILogger";
import IBlobMetadataStore from "../persistence/IBlobMetadataStore";

/**
 * BaseHandler class should maintain a singleton to persistency layer, such as maintain a database connection pool.
 * So every inherited classes instances can reuse the persistency layer connection.
 *
 * @export
 * @class SimpleHandler
 * @implements {IHandler}
 */
export default class BaseHandler {
  constructor(
    protected readonly metadataStore: IBlobMetadataStore,
    protected readonly extentStore: IExtentStore,
    protected readonly logger: ILogger,
    protected readonly loose: boolean,
    protected readonly eventSink?: IBlobEventSink
  ) {}

  /**
   * Emit a captured blob event if a sink is configured. Never throws: a
   * capture failure must not affect the originating storage operation.
   */
  protected emitBlobEvent(
    context: Context,
    eventType: BlobEventType,
    api: string,
    props: IBlobEventProps
  ): void {
    if (this.eventSink === undefined) {
      return;
    }
    try {
      this.eventSink.emit(createBlobEvent(context, eventType, api, props));
    } catch (err) {
      this.logger.warn(
        `Failed to emit blob event (${eventType}/${api}): ${
          err instanceof Error ? err.message : String(err)
        }`,
        context.contextId
      );
    }
  }
}
