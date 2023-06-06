import { ModifiedAccessConditions } from "../generated/artifacts/models";
import Context from "../generated/Context";
import { IConditionalHeaders } from "./IConditionalHeaders";

export default class ConditionalHeadersAdapter implements IConditionalHeaders {
  public ifModifiedSince?: Date;
  public ifUnmodifiedSince?: Date;
  public ifMatch?: string[];
  public ifNoneMatch?: string[];
  public ifTags?: string;

  public constructor(
    context: Context,
    modifiedAccessConditions: ModifiedAccessConditions = {}
  ) {
    // If-Match & If-None-Match allow multi values separated by comma
    if (modifiedAccessConditions.ifMatch) {
      this.ifMatch = modifiedAccessConditions.ifMatch.split(",").map(etag => {
        if (etag.startsWith('"') && etag.endsWith('"')) {
          return etag.substring(1, etag.length - 1);
        }
        return etag;
      });
    }

    if (modifiedAccessConditions.ifNoneMatch) {
      this.ifNoneMatch = modifiedAccessConditions.ifNoneMatch
        .split(",")
        .map(etag => {
          if (etag.startsWith('"') && etag.endsWith('"')) {
            return etag.substring(1, etag.length - 1);
          }
          return etag;
        });
    }

    // If-Modified-Since & If-Unmodified-Since don't support multi values
    this.ifModifiedSince = modifiedAccessConditions.ifModifiedSince;
    if (this.ifModifiedSince) {
      this.ifModifiedSince.setMilliseconds(0); // Precision to seconds
    }

    this.ifUnmodifiedSince = modifiedAccessConditions.ifUnmodifiedSince;
    if (this.ifUnmodifiedSince) {
      this.ifUnmodifiedSince.setMilliseconds(0); // Precision to seconds
    }

    this.ifTags = modifiedAccessConditions.ifTags;
  }
}
