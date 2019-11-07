/**
 * This interface is provided to arrange the concurrent operations like read/write for local file system.
 *
 * @export
 * @interface IOperationQueue
 */
export default interface IOperationQueue {
  /**
   * Add an operation to be executed.
   *
   * @template T
   * @param {Promise<T>} op
   * @param {string} [contextId]
   * @returns {Promise<T>}
   * @memberof IOperationQueue
   */
  operate<T>(op: () => Promise<T>, contextId?: string): Promise<T>;
}
