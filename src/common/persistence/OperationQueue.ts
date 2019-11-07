import { EventEmitter } from "events";

import ILogger from "../ILogger";
import IOperationQueue from "./IOperationQueue";

import uuid = require("uuid");
interface IOperation {
  id: string;
  op: () => Promise<any>;
}

export default class OperationQueue implements IOperationQueue {
  private operations: IOperation[];
  private emitter: EventEmitter;
  private runningConcurrency: number;
  public constructor(
    private maxConcurrency: number,
    private readonly logger: ILogger
  ) {
    this.operations = [];
    this.runningConcurrency = 0;
    this.emitter = new EventEmitter();
  }

  /**
   * Add an operation to be executed.
   *
   * @template T
   * @param {Promise<T>} op
   * @param {string} [contextId]
   * @returns {Promise<T>}
   * @memberof OperationQueue
   */
  public async operate<T>(
    op: () => Promise<T>,
    contextId?: string
  ): Promise<T> {
    const id = uuid();
    this.operations.push({ id, op });
    this.logger.debug(
      `OperationQueue.operate() Schedule incoming job ${id}`,
      contextId
    );

    this.execute(contextId);
    return new Promise<T>((resolve, reject) => {
      this.emitter
        .once(id, res => {
          this.logger.debug(
            `OperationQueue.operate() Job ${id} completes callback, resolve.`,
            contextId
          );

          this.emitter.removeAllListeners("error_" + id);
          resolve(res);

          process.nextTick(() => {
            this.execute(contextId);
          });
        })
        .once("error_" + id, err => {
          this.logger.debug(
            `OperationQueue.operate() Job ${id} error, reject.`,
            contextId
          );
          this.emitter.removeAllListeners(id);
          reject(err);
          process.nextTick(() => {
            this.execute(contextId);
          });
        });
    });
  }

  /**
   * It assists queue to execute the operation.
   *
   * @private
   * @param {string} [contextId]
   * @returns
   * @memberof OperationQueue
   */
  private async execute<T>(contextId?: string): Promise<any> {
    this.logger.debug(
      `OperationQueue:execute() Current runningConcurrency:${this.runningConcurrency} maxConcurrency:${this.maxConcurrency} operations.length:${this.operations.length}`,
      contextId
    );

    if (this.runningConcurrency < this.maxConcurrency) {
      if (this.operations.length === 0) {
        this.logger.debug(
          `OperationQueue:execute() return. Operation.length === 0`,
          contextId
        );
        return;
      }

      this.runningConcurrency++;
      const head = this.operations.shift();

      let res;
      try {
        // this.logger.debug(`OperationQueue:execute() await ${head!.id}`);
        res = await head!.op();
        // this.logger.debug(`OperationQueue:execute() ${head!.id} done`);
      } catch (err) {
        this.runningConcurrency--;
        // this.logger.debug(
        //   `OperationQueue:execute() ${head!.id} emit error ${err}`
        // );
        this.emitter.emit(`error_${head!.id}`, err);
        return;
      }
      this.runningConcurrency--;
      // this.logger.debug(
      //   `OperationQueue:execute() emit ${head!.id}. runningConcurrency: ${
      //     this.runningConcurrency
      //   }`
      // );
      this.emitter.emit(head!.id, res);
    }
  }
}
