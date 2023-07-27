import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";

/**
 * Represents a logical greater than or equal operation between two nodes (the `ge` query operator).
 * 
 * This is used in queries which resemble the following:
 * 
 *  RowKey ge 'bar'
 * 
 * In this case, the `GreaterThanEqualNode` would be the root node, with the left and right nodes
 * corresponding to the identifier `RowKey` and the constant `bar`, respectively.
 */
export default class GreaterThanEqualNode extends BinaryOperatorNode {
  get name(): string {
    return `ge`;
  }

  evaluate(context: IQueryContext): any {
    return this.left.evaluate(context) >= this.right.evaluate(context);
  }
}