import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

/**
 * Represents a unary "not" operation within the query.
 * 
 * This is used in queries which resemble the following:
 * 
 *   not (PartitionKey eq 'foo')
 * 
 * In this case, the `NotNode` would be the root node, with the right node
 * corresponding to `(PartitionKey eq 'foo')`. As a unary operator, there
 * is no left node.
 */
export default class NotNode implements IQueryNode {
  constructor(public right: IQueryNode) { }

  get name(): string {
    return "not";
  }

  evaluate(context: IQueryContext): any {
    return !this.right.evaluate(context);
  }

  toString(): string {
    return `(${this.name} ${this.right.toString()})`;
  }
}