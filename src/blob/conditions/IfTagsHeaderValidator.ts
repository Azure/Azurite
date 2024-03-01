import Context from "../generated/Context";
import { IConditionalHeaders } from "./IConditionalHeaders";
import IConditionResource from "./IConditionResource";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import { generateQueryBlobWithTagsWhereFunction } from "../persistence/QueryInterpreter/QueryInterpreter";

export function validateIfTagsHeader(
  context: Context,
  conditionalHeaders: IConditionalHeaders,
  resource: IConditionResource
): void {
  const evaluateBlobWithTagsFunction = generateQueryOrThrowInvalidHeader(
    context,
    conditionalHeaders
  );
  if (resource.exist) {
    if (!resource?.blobTags || !evaluateBlobWithTagsFunction(resource)) {
      throw StorageErrorFactory.getConditionNotMet(context.contextId!);
    }
  }
  // if it doesn't exist, BlobNotFound is thrown on caller (IBlobMetadataStore)
  return;
}

function generateQueryOrThrowInvalidHeader(
  context: Context,
  conditionalHeaders: IConditionalHeaders
) {
  try {
    return generateQueryBlobWithTagsWhereFunction(conditionalHeaders.ifTags);
  } catch (error) {
    throw StorageErrorFactory.getInvalidHeaderValue(context.contextId!, {
      HeaderName: "x-ms-if-tags",
      HeaderValue: conditionalHeaders.ifTags!
    });
  }
}
