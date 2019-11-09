/**
 * Persistency layer data store interface.
 *
 * @export
 * @interface IDataStore
 */
export default interface IDataStore {
  /**
   * Data store initial steps. Such as initial DB connections.
   *
   * @returns {Promise<void>}
   * @memberof IDataStore
   */
  init(): Promise<void>;

  /**
   * Whether data store has been initialized.
   *
   * @returns {boolean}
   * @memberof IDataStore
   */
  isInitialized(): boolean;

  /**
   * Data store close steps. Such as close DB connections.
   *
   * @returns {Promise<void>}
   * @memberof IDataStore
   */
  close(): Promise<void>;

  /**
   * Whether data store has been closed.
   *
   * @returns {boolean}
   * @memberof IDataStore
   */
  isClosed(): boolean;
}
