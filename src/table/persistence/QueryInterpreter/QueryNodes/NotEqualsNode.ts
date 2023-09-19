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
      const compareResult = this.left.compare(context, this.right);
      return compareResult !== 0 && !isNaN(compareResult);
    }

    if (this.right instanceof ValueNode) {
      const compareResult = this.right.compare(context, this.left);
      return compareResult !== 0 && !isNaN(compareResult);
    }

    const left = this.left.evaluate(context);
    const right = this.right.evaluate(context);

    return left !== right && left !== undefined && right !== undefined;
  }
}