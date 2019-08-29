export default interface IFDCache {
  /**
   * Init the FDCache.
   *
   * @returns {Promise<void>}
   * @memberof IFDCache
   */
  init(): Promise<void>;

  /**
   * Close FDCache, release the file descriptor.
   *
   * @returns {Promise<void>}
   * @memberof IFDCache
   */
  close(): Promise<void>;

  /**
   * Whether the fd has been initialized.
   *
   * @returns {boolean}
   * @memberof IFDCache
   */
  isInitialized(): boolean;

  /**
   * Whether the fd has benn closed.
   *
   * @returns {boolean}
   * @memberof IFDCache
   */
  isClosed(): boolean;

  /**
   * Get the fd with the given id.
   * Return -1 if the fd does not exist in the cache.
   *
   * @param {string} id
   * @returns {(number | undefined)}
   * @memberof IFDCache
   */
  get(id: string): number | undefined;

  /**
   * Insert a new fd to the cache.
   *
   * @param {string} id
   * @param {number} fd
   * @returns {void}
   * @memberof IFDCache
   */
  insert(id: string, fd: number): void;
}
