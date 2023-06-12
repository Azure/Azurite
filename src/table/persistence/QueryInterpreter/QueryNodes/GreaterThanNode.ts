import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";

/**
 * Represents a logical greater than operation between two nodes (the `gt` query operator).
 * 
 * This is used in queries which resemble the following:
 * 
 *  RowKey gt 'bar'
 * 
 * In this case, the `GreaterThanNode` would be the root node, with the left and right nodes
 * corresponding to the identifier `RowKey` and the constant `bar`, respectively.
 */
export default class GreaterThanNode extends BinaryOperatorNode {
  get name(): string {
    return `gt`;
  }

  evaluate(context: IQueryContext): any {
    return this.left.evaluate(context) > this.right.evaluate(context);
  }
}