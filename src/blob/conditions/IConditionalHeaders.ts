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

  /**
   * Specify a SQL where clause on blob tags to operate only on blobs with a matching value.
   */
  ifTags?: string;
}
