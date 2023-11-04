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
 * @class QueueGCManager
 * @implements {IGCManager}
 */
export default class QueueGCManager implements IGCManager {
  private _status: Status = Status.Closed;
  private emitter: EventEmitter = new EventEmitter();

  constructor(
    private readonly referredExtentsProvider: IGCExtentProvider,
    private readonly allExtentsProvider: IGCExtentProvider,
    private readonly extentStore: IExtentStore,
    private readonly errorHandler: (err: Error) => void,
    private readonly logger: ILogger,
    public readonly gcIntervalInMS: number = DEFAULT_GC_INTERVAL_MS
  ) {
    this.emitter.once("error", this.errorHandler);

    if (gcIntervalInMS <= 0) {
      this.gcIntervalInMS = 1000 * 60;
    }
  }

  public get status(): Status {
    return this._status;
  }

  public async start(): Promise<void> {
    if (this._status === Status.Running) {
      this.logger.info(
        `QueueGCManager:start() QueueGCManager successfully started. QueueGCManager is already in Running status.`
      );
      return;
    }

    if (this._status !== Status.Closed) {
      const error = new Error(
        `QueueGCManager:start() QueueGCManager cannot start, current manager is under ${
          Status[this._status]
        }`
      );
      this.logger.error(error.message);
      throw error;
    }

    this.logger.info(
      `QueueGCManager:start() Starting QueueGCManager, set status to Initializing`
    );
    this._status = Status.Initializing;

    if (!this.referredExtentsProvider.isInitialized()) {
      this.logger.info(
        `QueueGCManager:start() queueMetadata does not boot up. Starting queueMetadata.`
      );
      await this.referredExtentsProvider.init();
      this.logger.info(
        `QueueGCManager:start() queueMetadata successfully started.`
      );
    }

    this.logger.info(
      `QueueGCManager:start() Trigger mark and sweep loop, set status to Running.`
    );
    this._status = Status.Running;

    this.markSweepLoop()
      .then(() => {
        this.logger.info(
          `QueueGCManager:start() Mark and sweep loop is closed.`
        );
        this.emitter.emit("closed");
      })
      .catch(err => {
        this.logger.info(
          `QueueGCManager:start() Mark and seep loop emit error: ${err.name} ${err.message}`
        );
        this.logger.info("QueueGCManger:start() Set status to closed.");
        this._status = Status.Closed;
        this.emitter.emit("error", err);
      });

    this.logger.info(
      `QueueGCManager:start() QueueGCManager successfully started.`
    );
  }

  public async close(): Promise<void> {
    if (this._status === Status.Closed) {
      this.logger.info(
        `QueueGCManager:close() QueueGCManager successfully closed. QueueGCManager is already in Closed status.`
      );
      return;
    }

    if (this._status !== Status.Running) {
      const error = new Error(
        `QueueGCManager:close() QueueGCManager cannot close, current manager is under ${
          Status[this._status]
        }`
      );
      this.logger.error(error.message);
      throw error;
    }

    this.logger.info(
      `QueueGCManager:close() Start closing QueueGCManager, set status to Closing.`
    );
    this._status = Status.Closing;

    this.emitter.emit("abort");

    return new Promise<void>(resolve => {
      this.emitter.once("closed", () => {
        this.logger.info(
          `QueueGCManager:close() QueueGCManager successfully closed, set status to Closed.`
        );
        this._status = Status.Closed;
        resolve();
      });
    });
  }

  private async markSweepLoop(): Promise<void> {
    while (this._status === Status.Running) {
      this.logger.info(
        `QueueGCManager:markSweepLoop() Start new mark and sweep.`
      );
      const start = Date.now();
      await this.markSweep();
      const duration = Date.now() - start;
      this.logger.info(
        `QueueGCManager:markSweepLoop() Mark and sweep finished, take ${duration}ms.`
      );

      if (this._status === Status.Running) {
        this.logger.info(
          `QueueGCManager:markSweepLoop() Sleep for ${this.gcIntervalInMS}`
        );
        await this.sleep(this.gcIntervalInMS);
      }
    }
  }

  private async markSweep(): Promise<void> {
    this.logger.info(`QueueGCManger:markSweep() Get all extents.`);
    const allExtents = await this.getAllExtents();
    this.logger.info(
      `QueueGCManager:marksweep() Get ${allExtents.size} extents.`
    );

    if (this._status !== Status.Running) {
      return;
    }

    this.logger.info(
      `QueueGCManager:markSweep() Get referred extents, then remove from allExtents.`
    );
    const itr = this.referredExtentsProvider.iteratorExtents();
    for (
      let bucket = await itr.next();
      bucket.done === false;
      bucket = await itr.next()
    ) {
      if (this._status !== Status.Running) {
        break;
      }
      for (const item of bucket.value) {
        allExtents.delete(item);
      }
    }

    this.logger.info(
      `QueueGCManager:markSweep() Got referred extents, unreferenced extents count is ${allExtents.size}.`
    );

    if (allExtents.size > 0) {
      this.logger.info(
        `QueueGCManager:markSweep() Start to delete ${allExtents.size} unreferenced extents.`
      );
      const deletedCount = await this.extentStore.deleteExtents(allExtents);
      this.logger.info(
        `QueueGCManager:markSweep() Deleted ${deletedCount} unreferenced extents, after excluding active write extents.`
      );
    }
  }

  private async getAllExtents(): Promise<Set<string>> {
    const res: Set<string> = new Set<string>();

    const itr = this.allExtentsProvider.iteratorExtents();
    for (
      let bucket = await itr.next();
      bucket.done === false;
      bucket = await itr.next()
    ) {
      if (this._status !== Status.Running) {
        break;
      }
      for (const item of bucket.value) {
        res.add(item);
      }
    }

    return res;
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
