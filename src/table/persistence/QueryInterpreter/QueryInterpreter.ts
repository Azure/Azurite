import { IQueryContext } from "./IQueryContext";
import BinaryOperatorNode from "./QueryNodes/BinaryOperatorNode";
import ExpressionNode from "./QueryNodes/ExpressionNode";
import IQueryNode from "./QueryNodes/IQueryNode";
import IdentifierNode from "./QueryNodes/IdentifierNode";
import NotNode from "./QueryNodes/NotNode";
import PartitionKeyNode from "./QueryNodes/PartitionKeyNode";
import RowKeyNode from "./QueryNodes/RowKeyNode";
import TableNameNode from "./QueryNodes/TableNode";

export default function executeQuery(context: IQueryContext, queryTree: IQueryNode): boolean {
  return !!queryTree.evaluate(context)
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
  if (queryTree instanceof IdentifierNode) {
    return 1
  }

  if (queryTree instanceof TableNameNode) {
    return 1
  }

  if (queryTree instanceof PartitionKeyNode) {
    return 1
  }

  if (queryTree instanceof RowKeyNode) {
    return 1
  }

  if (queryTree instanceof BinaryOperatorNode) {
    return countIdentifierReferences(queryTree.left) + countIdentifierReferences(queryTree.right)
  }

  if (queryTree instanceof ExpressionNode) {
    return countIdentifierReferences(queryTree.child)
  }

  if (queryTree instanceof NotNode) {
    return countIdentifierReferences(queryTree.right)
  }

  return 0
}