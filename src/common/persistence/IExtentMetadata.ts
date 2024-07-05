import IDataStore from "../IDataStore";

/**
 * Maintains mapping relationship between extent ID and relative local file path/name.
 *
 * @interface IExtentModel
 */
export interface IExtentModel {
  id: string;
  persistencyId: string; // Destination persistency Id.
  path: string; // Relative local file path.
  size: number; // Extent size.
  LastModifyInMS: number; // Last modify time in millisecond.
}

/**
 * This interface is provided to arrange the local extent storage
 *
 * @export
 * @interface IExtentMetadata
 * @extends {IDataStore}
 */
export default interface IExtentMetadata extends IDataStore {
  /**
   * Update the extent status in DB. A new item will be created if the extent does not exists.
   *
   * @param {IExtentModel} extent
   * @returns {Promise<void>}
   * @memberof IExtentMetadata
   */
  updateExtent(extent: IExtentModel): Promise<void>;

  /**
   * List extents.
   *
   * @param {string} [id]
   * @param {number} [maxResults]
   * @param {number} [marker]
   * @param {Date} [queryTime]
   * @param {number} [UnmodifiedTime]
   * @returns {(Promise<[IExtentModel[], number | undefined]>)}
   * @memberof IExtentMetadata
   */
  listExtents(
    id?: string,
    maxResults?: number,
    marker?: number,
    queryTime?: Date,
    UnmodifiedTime?: number
  ): Promise<[IExtentModel[], number | undefined]>;

  /**
   * Create an async iterator to enumerate all extent IDs.
   *
   * @returns {AsyncIterator<string[]>}
   * @memberof IExtentMetadata
   */
  getExtentIterator(): AsyncIterator<string[]>;

  /**
   * Delete the extent metadata from DB with the extentId.
   *
   * @param {string} extentId
   * @returns {Promise<void>}
   * @memberof IExtentMetadata
   */
  deleteExtent(extentId: string): Promise<void>;

  /**
   * Get the persistencyId for a given extentId.
   *
   * @param {string} extentId
   * @returns {Promise<string>}
   * @memberof IExtentMetadata
   */
  getExtentPersistencyId(extentId: string): Promise<string>;
}
