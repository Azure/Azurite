import StorageErrorFactory from "../errors/StorageErrorFactory";
import { ModifiedAccessConditions } from "../generated/artifacts/models";
import Context from "../generated/Context";
import { BlobModel, ContainerModel } from "../persistence/IBlobMetadataStore";
import { generateQueryBlobWithTagsWhereFunction } from "../persistence/QueryInterpreter/QueryInterpreter";
import ConditionalHeadersAdapter from "./ConditionalHeadersAdapter";
import ConditionResourceAdapter from "./ConditionResourceAdapter";
import { IConditionalHeaders } from "./IConditionalHeaders";
import { IConditionalHeadersValidator } from "./IConditionalHeadersValidator";
import IConditionResource from "./IConditionResource";

export function validateReadConditions(
  context: Context,
  conditionalHeaders?: ModifiedAccessConditions,
  model?: BlobModel | ContainerModel | null,
  isSourceBlob?: boolean
) {
  new ReadConditionalHeadersValidator().validate(
    context,
    new ConditionalHeadersAdapter(context, conditionalHeaders),
    new ConditionResourceAdapter(model),
    isSourceBlob
  );
}

// tslint:disable: max-line-length
export default class ReadConditionalHeadersValidator
  implements IConditionalHeadersValidator {
  /**
   * Validate Conditional Headers for Blob Service Read Operations in Version 2013-08-15 or Later.
   * @link https://docs.microsoft.com/en-us/rest/api/storageservices/specifying-conditional-headers-for-blob-service-operations#specifying-conditional-headers-for-blob-service-read-operations-in-version-2013-08-15-or-later
   *
   * @param context
   * @param conditionalHeaders
   * @param resource
   * @param isSourceBlob 
   */
  public validate(
    context: Context,
    conditionalHeaders: IConditionalHeaders,
    resource: IConditionResource,
    isSourceBlob?: boolean
  ): void {
    // If-Match && If-Unmodified-Since && (If-None-Match || If-Modified-Since)

    // Read against a non exist resource
    if (!resource.exist) {
      // If-Match
      if (conditionalHeaders.ifMatch && conditionalHeaders.ifMatch.length > 0) {
        throw StorageErrorFactory.getConditionNotMet(context.contextId!);
      }

      // If If-Unmodified-Since
      // Skip for nonexistent resource

      // If-None-Match
      if (
        conditionalHeaders.ifNoneMatch &&
        conditionalHeaders.ifNoneMatch.length > 0 &&
        conditionalHeaders.ifNoneMatch[0] === "*"
      ) {
        throw StorageErrorFactory.getUnsatisfiableCondition(context.contextId!);
      }

      // If-Modified-Since
      // Skip for nonexistent resource
    } else {
      // Read against an existing resource
      // If-Match && If-Unmodified-Since && (If-None-Match || If-Modified-Since)

      // If-Match
      const ifMatchPass = conditionalHeaders.ifMatch
        ? conditionalHeaders.ifMatch.includes(resource.etag) ||
        conditionalHeaders.ifMatch[0] === "*"
        : undefined;

      // If-Unmodified-Since
      const ifUnModifiedSincePass = conditionalHeaders.ifUnmodifiedSince
        ? resource.lastModified <= conditionalHeaders.ifUnmodifiedSince
        : undefined;

      // If-None-Match
      if (
        conditionalHeaders.ifNoneMatch &&
        conditionalHeaders.ifNoneMatch.length > 0 &&
        conditionalHeaders.ifNoneMatch[0] === "*"
      ) {
        throw StorageErrorFactory.getUnsatisfiableCondition(context.contextId!);
      }

      const ifNoneMatchPass = conditionalHeaders.ifNoneMatch
        ? !conditionalHeaders.ifNoneMatch.includes(resource.etag)
        : undefined;

      // If-Modified-Since
      const isModifiedSincePass = conditionalHeaders.ifModifiedSince
        ? conditionalHeaders.ifModifiedSince < resource.lastModified
        : undefined;

      if (ifMatchPass === false) {
        throw StorageErrorFactory.getConditionNotMet(context.contextId!);
      }

      if (ifUnModifiedSincePass === false) {
        throw StorageErrorFactory.getConditionNotMet(context.contextId!);
      }

      if (ifNoneMatchPass === false && isModifiedSincePass !== true) {
        throw StorageErrorFactory.getNotModified(context.contextId!);
      }

      if (isModifiedSincePass === false && ifNoneMatchPass !== true) {
        throw StorageErrorFactory.getNotModified(context.contextId!);
      }

      if (conditionalHeaders.ifTags) {
        const againstSourceBlob = isSourceBlob === undefined ? false : isSourceBlob;
        const validateFunction = generateQueryBlobWithTagsWhereFunction(context, conditionalHeaders.ifTags, againstSourceBlob ? 'x-ms-source-if-tags' : 'x-ms-if-tags');

        if (conditionalHeaders?.ifTags !== undefined
          && validateFunction(resource.blobItemWithTags).length === 0) {
          throw StorageErrorFactory.getConditionNotMet(context.contextId!);
        }
      }
    }
  }
}
