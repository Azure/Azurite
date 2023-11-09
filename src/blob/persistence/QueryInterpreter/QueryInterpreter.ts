import { BlobTags } from "../../generated/artifacts/models";
import { BlobModel } from "../IBlobMetadataStore";
import BinaryOperatorNode from "./QueryNodes/BinaryOperatorNode";
import ExpressionNode from "./QueryNodes/ExpressionNode";
import IQueryNode from "./QueryNodes/IQueryNode";
import KeyNode from "./QueryNodes/KeyNode";
import parseQuery from "./QueryParser";

export default function executeQuery(context: BlobModel, queryTree: IQueryNode): boolean {
  let tags: any = {};
  const blobTags = context.blobTags;
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
  return !!queryTree.evaluate(tags)
}

/**
 * Validates that the provided query tree represents a valid query.
 * 
 * That is, a query containing at least one conditional expression,
 * where every conditional expression operates on at least
 * one column or built-in identifier (i.e. comparison between two constants is not allowed).
 * 
 * @param {IQueryNode} queryTree
 */
export function validateQueryTree(queryTree: IQueryNode) {
  const identifierReferences = countIdentifierReferences(queryTree);

  if (!identifierReferences) {
    throw new Error("Invalid Query, no identifier references found.")
  }
}

function countIdentifierReferences(queryTree: IQueryNode): number {
  if (queryTree instanceof KeyNode) {
    return 1;
  }

  if (queryTree instanceof BinaryOperatorNode) {
    return countIdentifierReferences(queryTree.left) + countIdentifierReferences(queryTree.right)
  }

  if (queryTree instanceof ExpressionNode) {
    return countIdentifierReferences(queryTree.child)
  }

  return 0
}


export function generateQueryBlobWithTagsWhereFunction(
  query: string | undefined,
  conditions: boolean = false
): (entity: any) => boolean {
  if (query === undefined) {
    return () => true;
  }

  const queryTree = parseQuery(query);
  validateQueryTree(queryTree);
  return (entity) => executeQuery(entity, queryTree);
}