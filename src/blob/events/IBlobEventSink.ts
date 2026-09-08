import { IBlobEvent } from "./IBlobEvent";

/**
 * Destination for captured blob events. Implementations must never throw from
 * emit(): a capture failure must not affect the originating storage operation.
 */
export default interface IBlobEventSink {
  /** Prepare the sink (e.g. ensure the target folder exists). */
  init(): Promise<void>;
  /** Fire-and-forget: record one event. Must not throw. */
  emit(event: IBlobEvent): void;
  /** Await any in-flight work so shutdown is clean. */
  close(): Promise<void>;
}
