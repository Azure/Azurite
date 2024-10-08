import StorageError from "../../errors/StorageError";
import StorageErrorFactory from "../../errors/StorageErrorFactory";
import { BlobTags } from "../../generated/artifacts/models";
import Context from "../../generated/Context";
import { FilterBlobModel } from "../IBlobMetadataStore";
import BinaryOperatorNode from "./QueryNodes/BinaryOperatorNode";
import ExpressionNode from "./QueryNodes/ExpressionNode";
import IQueryNode, { TagContent } from "./QueryNodes/IQueryNode";
import parseQuery from "./QueryParser";

export default function executeQuery(context: FilterBlobModel, queryTree: IQueryNode): TagContent[] {
  let tags: any = {};
  const blobTags = context.tags;
  if (blobTags) {
    let blobTagsValue: BlobTags;
    if (typeof (blobTags) === 'string') {
      blobTagsValue = JSON.parse(blobTags as any);
    }
    else {
      blobTagsValue = blobTags;
    }
    blobTagsValue.blobTagSet.forEach((aTag) => {
      tags[aTag.key] = aTag.value;
    })
  }
  tags["@container"] = context.containerName;
  return queryTree.evaluate(tags)
}

function countIdentifierReferences(queryTree: IQueryNode): number {
  if (queryTree instanceof BinaryOperatorNode) {
    return 1;
  }

  if (queryTree instanceof ExpressionNode) {
    return countIdentifierReferences(queryTree.child)
  }

  return 0
}


export function generateQueryBlobWithTagsWhereFunction(
  requestContext: Context,
  query: string | undefined,
  conditionHeader?: string,
): (entity: any) => TagContent[] {
  if (query === undefined) {
    return () => {
      return [];
    }
  }

  const queryTree = parseQuery(requestContext, query, conditionHeader);

  // Validates that the provided query tree represents a valid query.
  // That is, a query containing at least one conditional expression,
  // where every conditional expression operates on at least
  // one column or built -in identifier(i.e.comparison between two constants is not allowed).
  const identifierReferencesCount = countIdentifierReferences(queryTree);
  if (identifierReferencesCount == 0) {
    if (conditionHeader === undefined) {
      throw new StorageError(
        400,
        `InvalidQueryParameterValue`,
        `Error parsing query at or near character position 1: expected an operator`,
        requestContext.contextId!,
        {
          QueryParameterName: `where`,
          QueryParameterValue: query
        });
    }
    else {
      throw StorageErrorFactory.getInvalidHeaderValue(
        requestContext.contextId!, {
        HeaderName: conditionHeader,
        HeaderValue: query
      });
    }
  }

  return (entity) => executeQuery(entity, queryTree);
}