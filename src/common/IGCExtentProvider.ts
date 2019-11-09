import IDataStore from "./IDataStore";

export default interface IGCExtentProvider extends IDataStore {
  /**
   * Create an async iterator to enumerate all extent IDs.
   *
   * @returns {AsyncIterator<string[]>}
   * @memberof IGCExtentProvider
   */
  iteratorExtents(): AsyncIterator<string[]>;
}
