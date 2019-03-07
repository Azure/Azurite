/**
 * Persistency layer data store interface.
 *
 * @export
 * @interface IDataStore
 */
export interface IDataStore {
  /**
   * Data store initial steps. Such as initial DB connections.
   *
   * @returns {Promise<void>}
   * @memberof IDataStore
   */
  init(): Promise<void>;

  /**
   * Data store close steps. Such as close DB connections.
   *
   * @returns {Promise<void>}
   * @memberof IDataStore
   */
  close(): Promise<void>;
}
