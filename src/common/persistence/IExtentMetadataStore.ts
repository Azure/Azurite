import { IDataStore } from "../IDataStore";

/**
 * Maintains mapping relationship between extent ID and relative local file path/name.
 *
 * @interface IExtentModel
 */
export interface IExtentModel {
  /**
   * Extent ID.
   *
   * @type {string}
   * @memberof IExtentModel
   */
  id: string;

  /**
   * Destination persistencyId
   *
   * @type {string}
   * @memberof IExtentModel
   */
  persistencyId: string;

  /**
   * Relative local file path/name.
   *
   * @type {string}
   * @memberof IExtentModel
   */
  path: string;

  /**
   * Current size of this extent.
   *
   * @type {number}
   * @memberof IExtentModel
   */
  size: number;

  /**
   * Last modify time in millisecond
   *
   * @type {number}
   * @memberof IExtentModel
   */
  lastModifiedInMS: number;
}

/**
 * This interface is provided to arrange the local extent storage.
 *
 * @export
 * @interface IExtentMetadata
 * @extends {IDataStore}
 */
export default interface IExtentMetadataStore extends IDataStore {
  /**
   * Update the extent status in DB. A new item will be created if the extent does not exists.
   *
   * @param {IExtentModel} extent
   * @returns {Promise<void>}
   * @memberof IExtentMetadata
   */
  updateExtent(extent: IExtentModel): Promise<void>;

  /**
   * Delete the extent metadata from DB with the extentId.
   *
   * @param {string} extentId
   * @returns {Promise<void>}
   * @memberof IExtentMetadata
   */
  deleteExtent(extentId: string): Promise<void>;

  /**
   * List extents.
   *
   * @param {string} [id]
   * @param {number} [maxResults]
   * @param {(number | undefined)} [marker]
   * @param {Date} [queryTime]
   * @param {number} [releaseTime]
   * @returns {(Promise<[IExtentModel[], number | undefined]>)}
   * @memberof SqlExtentMetadataStore
   */
  listExtents(
    id?: string,
    maxResults?: number,
    marker?: number | undefined,
    queryTime?: Date,
    releaseTime?: number
  ): Promise<[IExtentModel[], number | undefined]>;

  /**
   * Get the persistencyId for a given extentId.
   *
   * @param {string} extentId
   * @returns {Promise<string>}
   * @memberof IExtentMetadata
   */
  getExtentPersistencyId(extentId: string): Promise<string>;
}
