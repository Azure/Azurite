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
   * @returns {Promise<T>}
   * @memberof OperationQueue
   */
  public async operate<T>(op: () => Promise<T>): Promise<T> {
    const id = uuid();
    this.operations.push({ id, op });
    this.logger.debug(`OperationQueue.operate(${id})`);

    this.execute();
    return new Promise<T>((resolve, reject) => {
      this.emitter
        .once(id, res => {
          this.logger.debug(
            `OperationQueue.operate(${id}) got callback, resolve`
          );

          this.emitter.removeAllListeners("error_" + id);
          resolve(res);

          process.nextTick(() => {
            this.execute();
          });
        })
        .once("error_" + id, err => {
          this.logger.debug(`OperationQueue.operate(${id}) got error, reject`);
          this.emitter.removeAllListeners(id);
          reject(err);
          process.nextTick(() => {
            this.execute();
          });
        });
    });
  }

  /**
   * It assists queue to execute the operation.
   *
   * @private
   * @returns
   * @memberof OperationQueue
   */
  private async execute<T>(): Promise<any> {
    this.logger.debug(
      `OperationQueue.execute() runningConcurrency:${
        this.runningConcurrency
      } maxConcurrency:${this.maxConcurrency}`
    );

    if (this.runningConcurrency < this.maxConcurrency) {
      this.logger.debug(
        `OperationQueue.execute() operations.length:${this.operations.length}`
      );
      if (this.operations.length === 0) {
        this.logger.debug(
          `OperationQueue.execute() return. Operation.length === 0`
        );
        return;
      }

      this.runningConcurrency++;
      const head = this.operations.shift();

      let res;
      try {
        this.logger.debug(`OperationQueue.execute() await ${head!.id}`);
        res = await head!.op();
        this.logger.debug(`OperationQueue.execute() ${head!.id} done`);
      } catch (err) {
        this.runningConcurrency--;
        this.logger.debug(
          `OperationQueue.execute() ${head!.id} emit error ${err}`
        );
        this.emitter.emit(`error_${head!.id}`, err);
        return;
      }
      this.runningConcurrency--;
      this.logger.debug(
        `OperationQueue.execute() emit ${head!.id}. runningConcurrency: ${
          this.runningConcurrency
        }`
      );
      this.emitter.emit(head!.id, res);
    }
  }
}
