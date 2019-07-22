export default interface IGCExtentProvider {
  /**
   * Create an async iterator to enumerate all extent IDs.
   *
   * @returns {AsyncIterator<string[]>}
   * @memberof IGCExtentProvider
   */
  iteratorAllExtents(): AsyncIterator<string[]>;
}
