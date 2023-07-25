import { IQueryContext } from "./IQueryContext";
import IQueryNode from "./QueryNodes/IQueryNode";

/**
 * Executes a given query tree against a given context.
 * 
 * This method is effectively a wrapper around IQueryNode.evaluate,
 * ensuring that the result is a boolean value.
 * 
 * @param {IQueryContext} context The query context to execute the query against. This may be either a table or an entity.
 * @param {IQueryNode} queryTree The query tree to execute.
 * @returns {boolean} The result of the query in this context.
 */
export default function executeQuery(context: IQueryContext, queryTree: IQueryNode): boolean {
  return !!queryTree.evaluate(context);
}
