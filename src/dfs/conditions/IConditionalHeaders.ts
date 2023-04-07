export interface IConditionalHeaders {
  ifModifiedSince?: Date;
  ifUnmodifiedSince?: Date;

  /**
   * If-Match etag list without quotes.
   */
  ifMatch?: string[];

  /**
   * If-None-Match etag list without quotes.
   */
  ifNoneMatch?: string[];
}
