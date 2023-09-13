import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";
import ValueNode from "./ValueNode";

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
    if (this.left instanceof ValueNode) {
      return this.left.compare(context, this.right) >= 0;
    }

    if (this.right instanceof ValueNode) {
      return this.right.compare(context, this.left) <= 0;
    }

    return this.left.evaluate(context) >= this.right.evaluate(context);
  }
}