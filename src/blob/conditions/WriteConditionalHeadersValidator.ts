import StorageErrorFactory from "../errors/StorageErrorFactory";
import {
  ModifiedAccessConditions,
  SequenceNumberAccessConditions
} from "../generated/artifacts/models";
import Context from "../generated/Context";
import { BlobModel, ContainerModel } from "../persistence/IBlobMetadataStore";
import { generateQueryBlobWithTagsWhereFunction } from "../persistence/QueryInterpreter/QueryInterpreter";
import ConditionalHeadersAdapter from "./ConditionalHeadersAdapter";
import ConditionResourceAdapter from "./ConditionResourceAdapter";
import { IConditionalHeaders } from "./IConditionalHeaders";
import { IConditionalHeadersValidator } from "./IConditionalHeadersValidator";
import IConditionResource from "./IConditionResource";

export function validateSequenceNumberWriteConditions(
  context: Context,
  conditionalHeaders?: SequenceNumberAccessConditions,
  model?: BlobModel
) {
  if (!conditionalHeaders || !model) {
    return;
  }

  if (!model.properties || model.properties.blobSequenceNumber === undefined) {
    throw Error(
      `validateSequenceNumberWriteConditions() Invalid blob model, blobSequenceNumber is not specified.`
    );
  }

  if (
    conditionalHeaders.ifSequenceNumberLessThanOrEqualTo !== undefined &&
    conditionalHeaders.ifSequenceNumberLessThanOrEqualTo <
    model.properties.blobSequenceNumber
  ) {
    throw StorageErrorFactory.getSequenceNumberConditionNotMet(
      context.contextId!
    );
  }

  if (
    conditionalHeaders.ifSequenceNumberLessThan !== undefined &&
    conditionalHeaders.ifSequenceNumberLessThan <=
    model.properties.blobSequenceNumber
  ) {
    throw StorageErrorFactory.getSequenceNumberConditionNotMet(
      context.contextId!
    );
  }

  if (
    conditionalHeaders.ifSequenceNumberEqualTo !== undefined &&
    conditionalHeaders.ifSequenceNumberEqualTo !==
    model.properties.blobSequenceNumber
  ) {
    throw StorageErrorFactory.getSequenceNumberConditionNotMet(
      context.contextId!
    );
  }
}

export function validateWriteConditions(
  context: Context,
  conditionalHeaders?: ModifiedAccessConditions,
  model?: BlobModel | ContainerModel | null
) {
  new WriteConditionalHeadersValidator().validate(
    context,
    new ConditionalHeadersAdapter(context, conditionalHeaders),
    new ConditionResourceAdapter(model)
  );
}

// tslint:disable: max-line-length
export default class WriteConditionalHeadersValidator
  implements IConditionalHeadersValidator {
  /**
   * Validate conditional Headers for Read Operations in Versions Prior to 2013-08-15,
   * and for Write Operations (All Versions).
   * @link https://docs.microsoft.com/en-us/rest/api/storageservices/specifying-conditional-headers-for-blob-service-operations#specifying-conditional-headers-for-read-operations-in-versions-prior-to-2013-08-15-and-for-write-operations-all-versions
   *
   * @param context
   * @param conditionalHeaders
   * @param resource
   */
  public validate(
    context: Context,
    conditionalHeaders: IConditionalHeaders,
    resource: IConditionResource
  ): void {
    this.validateCombinations(context, conditionalHeaders);
    if (!resource.exist) {
      if (
        conditionalHeaders.ifNoneMatch &&
        conditionalHeaders.ifNoneMatch.length > 0
      ) {
        // If a request specifies both the If-None-Match and If-Modified-Since headers,
        // the request is evaluated based on the criteria specified in If-None-Match.
        // Skip for non exist blob
        return;
      }

      if (conditionalHeaders.ifMatch && conditionalHeaders.ifMatch.length > 0) {
        // If a request specifies both the If-Match and If-Unmodified-Since headers,
        // the request is evaluated based on the criteria specified in If-Match.
        if (conditionalHeaders.ifMatch[0] !== "*") {
          throw StorageErrorFactory.getConditionNotMet(context.contextId!);
        }
        return;
      }

      if (conditionalHeaders.ifModifiedSince) {
        // Skip for non exist blob
        return;
      }

      if (conditionalHeaders.ifUnmodifiedSince) {
        // Skip for non exist blob
        return;
      }
    } else {
      if (
        conditionalHeaders.ifNoneMatch &&
        conditionalHeaders.ifNoneMatch.length > 0
      ) {
        if (conditionalHeaders.ifNoneMatch[0] === "*") {
          // According to restful doc, specify the wildcard character (*) to perform the operation
          // only if the resource does not exist, and fail the operation if it does exist.
          // However, Azure Storage Set Blob Properties Operation for an existing blob doesn't return 412 with *
          // TODO: Check accurate behavior for different write operations
          // Put Blob, Commit Block List has special logic for ifNoneMatch equals *, will return 409 conflict for existing blob, will handled in createBlob metadata store.
          // throw StorageErrorFactory.getConditionNotMet(context.contextId!);
          return;
        }
        if (conditionalHeaders.ifNoneMatch[0] === resource.etag) {
          throw StorageErrorFactory.getConditionNotMet(context.contextId!);
        }

        // Stop processing
        // If a request specifies both the If-None-Match and If-Modified-Since headers,
        // the request is evaluated based on the criteria specified in If-None-Match.
        return;
      }

      if (conditionalHeaders.ifMatch && conditionalHeaders.ifMatch.length > 0) {
        if (
          conditionalHeaders.ifMatch[0] !== "*" &&
          conditionalHeaders.ifMatch[0] !== resource.etag
        ) {
          throw StorageErrorFactory.getConditionNotMet(context.contextId!);
        }

        // Stop processing
        // If a request specifies both the If-Match and If-Unmodified-Since headers,
        // the request is evaluated based on the criteria specified in If-Match.
        return;
      }

      if (conditionalHeaders.ifModifiedSince) {
        if (resource.lastModified <= conditionalHeaders.ifModifiedSince) {
          throw StorageErrorFactory.getConditionNotMet(context.contextId!);
        }
        return;
      }

      if (conditionalHeaders.ifUnmodifiedSince) {
        if (conditionalHeaders.ifUnmodifiedSince < resource.lastModified) {
          throw StorageErrorFactory.getConditionNotMet(context.contextId!);
        }
        return;
      }

      if (conditionalHeaders.ifTags) {
        const validateFunction = generateQueryBlobWithTagsWhereFunction(context, conditionalHeaders.ifTags, 'x-ms-if-tags');

        if (conditionalHeaders?.ifTags !== undefined
          && validateFunction(resource.blobItemWithTags).length === 0) {
          throw StorageErrorFactory.getConditionNotMet(context.contextId!);
        }
      }
    }
  }

  private validateCombinations(
    context: Context,
    conditionalHeaders: IConditionalHeaders
  ) {
    let ifMatch = 0;
    if (conditionalHeaders.ifMatch && conditionalHeaders.ifMatch.length > 0) {
      // RFC 2616 allows multiple ETag values in a single header,
      // but requests to the Blob service can only include one ETag value.
      // Specifying more than one ETag value results in status code 400 (Bad Request).
      if (conditionalHeaders.ifMatch.length > 1) {
        // throw 400 MultipleConditionHeadersNotSupported Multiple condition headers are not supported.
        throw StorageErrorFactory.getMultipleConditionHeadersNotSupported(
          context.contextId!
        );
      }

      ifMatch = 1;
    }

    let ifModifiedSince = 0;
    if (conditionalHeaders.ifModifiedSince) {
      ifModifiedSince = 1;
    }

    let ifNoneMatch = 0;
    if (
      conditionalHeaders.ifNoneMatch &&
      conditionalHeaders.ifNoneMatch.length > 0
    ) {
      // RFC 2616 allows multiple ETag values in a single header,
      // but requests to the Blob service can only include one ETag value.
      // Specifying more than one ETag value results in status code 400 (Bad Request).
      if (conditionalHeaders.ifNoneMatch.length > 1) {
        // throw 400 MultipleConditionHeadersNotSupported Multiple condition headers are not supported.
        throw StorageErrorFactory.getMultipleConditionHeadersNotSupported(
          context.contextId!
        );
      }
      ifNoneMatch = 1;
    }

    let ifUnmodifiedSince = 0;
    if (conditionalHeaders.ifUnmodifiedSince) {
      ifUnmodifiedSince = 1;
    }

    if (ifMatch + ifModifiedSince + ifNoneMatch + ifUnmodifiedSince > 2) {
      // throw 400 MultipleConditionHeadersNotSupported Multiple condition headers are not supported.
      throw StorageErrorFactory.getMultipleConditionHeadersNotSupported(
        context.contextId!
      );
    }

    if (ifMatch + ifModifiedSince + ifNoneMatch + ifUnmodifiedSince === 2) {
      if (ifNoneMatch + ifModifiedSince === 1) {
        // throw 400 MultipleConditionHeadersNotSupported Multiple condition headers are not supported.
        throw StorageErrorFactory.getMultipleConditionHeadersNotSupported(
          context.contextId!
        );
      }
    }
  }
}
