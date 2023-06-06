import { FilterBlobModel } from "../persistence/IBlobMetadataStore";

export default interface IConditionResource {
  /**
   * Whether resource exists or not.
   */
  exist: boolean;

  /**
   * etag string without quotes.
   */
  etag: string;

  /**
   * last modified time for container or blob.
   */
  lastModified: Date;
  blobItemWithTags?: FilterBlobModel;
}
