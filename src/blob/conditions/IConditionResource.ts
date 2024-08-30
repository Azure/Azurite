import { BlobTags } from "../generated/artifacts/models";

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

  /**
   * optional resource blog tags.
   */
  tags?: BlobTags;
}
