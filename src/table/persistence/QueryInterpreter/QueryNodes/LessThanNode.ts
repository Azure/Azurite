import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";
import ValueNode from "./ValueNode";

/**
 * Represents a logical less than operation between two nodes (the `lt` query operator).
 * 
 * This is used in queries which resemble the following:
 * 
 *   RowKey lt 'bar'
 * 
 * In this case, the `LessThanNode` would be the root node, with the left and right nodes
 * corresponding to the identifier `RowKey` and the constant `bar`, respectively.
 */
export default class LessThanNode extends BinaryOperatorNode {
  get name(): string {
    return `lt`;
  }

  evaluate(context: IQueryContext): any {
    if (this.left instanceof ValueNode) {
      return this.left.compare(context, this.right) < 0;
    }

    if (this.right instanceof ValueNode) {
      return this.right.compare(context, this.left) > 0;
    }

    return this.left.evaluate(context) < this.right.evaluate(context);
  }
}