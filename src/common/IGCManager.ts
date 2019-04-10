/**
 * GC manager interface.
 *
 * @export
 * @interface IGCManager
 */
export default interface IGCManager {
  /**
   * Initialize GC manager and start GC loop.
   *
   * @returns {Promise<void>}
   * @memberof IGCManager
   */
  start(): Promise<void>;

  /**
   * Abort and stop GC loop.
   *
   * @returns {Promise<void>}
   * @memberof IGCManager
   */
  close(): Promise<void>;
}
