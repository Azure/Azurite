import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";
import ValueNode from "./ValueNode";

/**
 * Represents a logical not equal operation between two nodes (the `ne` query operator).
 * 
 * This is used in queries which resemble the following:
 * 
 *   RowKey ne 'bar'
 * 
 * In this case, the `NotEqualsNode` would be the root node, with the left and right nodes
 * corresponding to the identifier `RowKey` and the constant `bar`, respectively.
 * 
 * NOTE: This operation includes backwards compatibility for the `guid` type hint, since
 *       earlier versions of Azurite stored guid values in their raw string format.
 */
export default class NotEqualsNode extends BinaryOperatorNode {
  get name(): string {
    return `ne`
  }

  evaluate(context: IQueryContext): any {
    if (this.left instanceof ValueNode) {
      return this.left.compare(context, this.right) !== 0;
    }

    if (this.right instanceof ValueNode) {
      return this.right.compare(context, this.left) !== 0;
    }

    const left = this.left.evaluate(context);
    const right = this.right.evaluate(context);

    return left !== right && left !== undefined && right !== undefined;
  }
}