import BinaryOperatorNode from "./QueryNodes/BinaryOperatorNode";
import IQueryNode from "./QueryNodes/IQueryNode";
import IdentifierNode from "./QueryNodes/IdentifierNode";
import NotNode from "./QueryNodes/NotNode";

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

  if (identifierReferences === 0) {
    throw new Error("Invalid Query, no identifier references found.");
  }
}

function countIdentifierReferences(queryTree: IQueryNode): number {
  if (queryTree instanceof IdentifierNode) {
    return 1;
  }

  if (queryTree instanceof BinaryOperatorNode) {
    return countIdentifierReferences(queryTree.left) + countIdentifierReferences(queryTree.right);
  }

  if (queryTree instanceof NotNode) {
    return countIdentifierReferences(queryTree.right);
  }

  return 0;
}