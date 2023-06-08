import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";

/**
 * Represents a logical less than or equal operation between two nodes (the `le` query operator).
 * 
 * This is used in queries which resemble the following:
 * 
 *   RowKey le 'bar'
 * 
 * In this case, the `LessThanEqualNode` would be the root node, with the left and right nodes
 * corresponding to the identifier `RowKey` and the constant `bar`, respectively.
 */
export default class LessThanEqualNode extends BinaryOperatorNode {
  get name(): string {
    return `le`;
  }

  evaluate(context: IQueryContext): any {
    return this.left.evaluate(context) <= this.right.evaluate(context);
  }
}