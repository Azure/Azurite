import { EventEmitter } from "events";

import IGCExtentProvider from "../../common/IGCExtentProvider";
import IGCManager from "../../common/IGCManager";
import IExtentStore from "../../common/persistence/IExtentStore";
import ILogger from "../generated/utils/ILogger";
import { DEFAULT_GC_INTERVAL_MS } from "../utils/constants";

enum Status {
  Initializing,
  Running,
  Closing,
  Closed
}

/**
 * GC manager to clean up unused extents mapped local files based on mark and sweep
 * algorithm.
 *
 * In the future, GC manager can also help merging small extent mapped files
 * into one big file to improve the performance.
 *
 * @export
 * @class BlobGCManager
 * @implements {IGCManager}
 */
export default class BlobGCManager implements IGCManager {
  private _status: Status = Status.Closed;
  private emitter: EventEmitter = new EventEmitter();

  /**
   * Creates an instance of BlobGCManager.
   *
   * @param {IBlobMetadataStore} blobDataStore
   * @param {(err: Error) => void} errorHandler Error handler callback to handle critical errors during GC loop
   *                                            When an error happens, GC loop will close automatically
   * @param {ILogger} logger
   * @param {number} [gcIntervalInMS=DEFAULT_GC_INTERVAL_MS]
   * @memberof BlobGCManager
   */
  constructor(
    private readonly referredExtentsProvider: IGCExtentProvider,
    private readonly allExtentsProvider: IGCExtentProvider,
    private readonly extentStore: IExtentStore,
    private readonly errorHandler: (err: Error) => void,
    private readonly logger: ILogger,
    public readonly gcIntervalInMS: number = DEFAULT_GC_INTERVAL_MS
  ) {
    this.emitter.once("error", this.errorHandler);

    // Avoid infinite GC loop
    if (gcIntervalInMS <= 0) {
      this.gcIntervalInMS = 1;
    }
  }

  public get status(): Status {
    return this._status;
  }

  /**
   * Initialize and start GC manager.
   *
   * @returns {Promise<void>}
   * @memberof BlobGCManager
   */
  public async start(): Promise<void> {
    if (this._status === Status.Running) {
      this.logger.info(
        `BlobGCManager:start() BlobGCManager successfully started. BlobGCManager is already in Running status.`
      );
      return;
    }

    if (this._status !== Status.Closed) {
      const error = new Error(
        `BlobGCManager:start() BlobGCManager cannot start, current manager is under ${
          Status[this._status]
        }`
      );
      this.logger.error(error.message);
      throw error;
    }

    this.logger.info(
      `BlobGCManager:start() Starting BlobGCManager. Set status to Initializing.`
    );
    this._status = Status.Initializing;

    if (!this.referredExtentsProvider.isInitialized()) {
      this.logger.info(
        `BlobGCManager:start() blobDataStore doesn't boot up. Starting blobDataStore.`
      );
      await this.referredExtentsProvider.init();
      this.logger.info(
        `BlobGCManager:start() blobDataStore successfully started.`
      );
    }

    if (!this.allExtentsProvider.isInitialized()) {
      this.logger.info(
        `BlobGCManager:start() extentMetadata doesn't boot up. Starting extentMetadata.`
      );
      await this.allExtentsProvider.init();
      this.logger.info(
        `BlobGCManager:start() extentMetadata successfully started.`
      );
    }

    if (!this.extentStore.isInitialized()) {
      this.logger.info(
        `BlobGCManager:start() extentStore doesn't boot up. Starting extentStore.`
      );
      await this.extentStore.init();
      this.logger.info(
        `BlobGCManager:start() extentStore successfully started.`
      );
    }

    this.logger.info(
      `BlobGCManager:start() Trigger mark and sweep loop. Set status to Running.`
    );
    this._status = Status.Running;

    this.markSweepLoop()
      .then(() => {
        this.logger.info(
          `BlobGCManager:start() Mark and sweep loop is closed.`
        );
        this.emitter.emit("closed");
      })
      .catch(err => {
        this.logger.info(
          `BlobGCManager:start() Mark and sweep loop emits error: ${err.name} ${err.message}`
        );
        this.logger.info(`BlobGCManager:start() Set status to Closed.`);
        this._status = Status.Closed;
        this.emitter.emit("error", err);
      });

    this.logger.info(
      `BlobGCManager:start() BlobGCManager successfully started.`
    );
  }

  public async close(): Promise<void> {
    if (this._status === Status.Closed) {
      this.logger.info(
        `BlobGCManager:close() BlobGCManager successfully closed. BlobGCManager is already in Closed status.`
      );
      return;
    }

    if (this._status !== Status.Running) {
      const error = new Error(
        `BlobGCManager:close() BlobGCManager cannot close, current manager is under ${
          Status[this._status]
        }`
      );
      this.logger.error(error.message);
      throw error;
    }

    this.logger.info(
      `BlobGCManager:close() Start closing BlobGCManager. Set status to Closing.`
    );
    this._status = Status.Closing;

    this.emitter.emit("abort");

    return new Promise<void>(resolve => {
      this.emitter.once("closed", () => {
        this.logger.info(
          `BlobGCManager:close() BlobGCManager successfully closed. Set status to Closed.`
        );
        this._status = Status.Closed;
        resolve();
      });
    });
  }

  private async markSweepLoop(): Promise<void> {
    while (this._status === Status.Running) {
      this.logger.info(
        `BlobGCManager:markSweepLoop() Start next mark and sweep.`
      );
      const start = Date.now();
      await this.markSweep();
      const period = Date.now() - start;
      this.logger.info(
        `BlobGCManager:markSweepLoop() Mark and sweep finished, taken ${period}ms.`
      );

      if (this._status === Status.Running) {
        this.logger.info(
          `BlobGCManager:markSweepLoop() Sleep for ${this.gcIntervalInMS}ms.`
        );
        await this.sleep(this.gcIntervalInMS);
      }
    }
  }

  /**
   * Typical mark-sweep GC algorithm.
   *
   * @private
   * @returns {Promise<void>}
   * @memberof BlobGCManager
   */
  private async markSweep(): Promise<void> {
    // mark
    this.logger.info(`BlobGCManager:markSweep() Get all extents.`);
    const allExtents = await this.getAllExtents();
    this.logger.info(
      `BlobGCManager:markSweep() Got ${allExtents.size} extents.`
    );

    if (this._status !== Status.Running) {
      return;
    }

    this.logger.info(`BlobGCManager:markSweep() Get referred extents.`);
    const iter = this.referredExtentsProvider.iteratorExtents();
    for (
      let res = await iter.next();
      (res.done === false || res.value.length > 0) &&
      this._status === Status.Running;
      res = await iter.next()
    ) {
      const chunks = res.value;
      for (const chunk of chunks) {
        allExtents.delete(chunk); // TODO: Mark instead of removing from Set to improve performance
      }
    }
    this.logger.info(
      `BlobGCManager:markSweep() Got referred extents, unreferenced extents count is ${allExtents.size}.`
    );

    // sweep
    if (allExtents.size > 0) {
      this.logger.info(
        `BlobGCManager:markSweep() Try to delete ${allExtents.entries} unreferenced extents.`
      );
      const deletedCount = await this.extentStore.deleteExtents(allExtents);
      this.logger.info(
        `BlobGCManager:markSweep() Deleted unreferenced ${deletedCount} extents, after excluding active write extents.`
      );
    }
  }

  private async getAllExtents(): Promise<Set<string>> {
    const ids: Set<string> = new Set<string>();

    const iter = this.allExtentsProvider.iteratorExtents();
    for (
      let res = await iter.next();
      (res.done === false || res.value.length > 0) &&
      this._status === Status.Running;
      res = await iter.next()
    ) {
      for (const chunk of res.value) {
        ids.add(chunk);
      }
    }

    return ids;
  }

  private async sleep(timeInMS: number): Promise<void> {
    if (timeInMS === 0) {
      return;
    }

    return new Promise<void>(resolve => {
      let timer: NodeJS.Timeout;
      const abortListener = () => {
        if (timer) {
          clearTimeout(timer);
        }
        this.emitter.removeListener("abort", abortListener);
        resolve();
      };

      // https://stackoverflow.com/questions/45802988/typescript-use-correct-version-of-settimeout-node-vs-window
      timer = (setTimeout(() => {
        this.emitter.removeListener("abort", abortListener);
        resolve();
      }, timeInMS) as any) as NodeJS.Timeout;
      timer.unref();
      this.emitter.on("abort", abortListener);
    });
  }
}
