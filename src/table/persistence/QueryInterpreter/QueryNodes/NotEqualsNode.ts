import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";
import GuidNode from "./GuidNode";

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
    const left = this.left.evaluate(context);
    const right = this.right.evaluate(context);

    // If either side is undefined, we should not match - this only occurs in scenarios where
    // the field itself doesn't exist on the entity.
    return left !== right && left !== undefined && right !== undefined && this.backwardsCompatibleGuidEvaluate(context);
  }

  private backwardsCompatibleGuidEvaluate(context: IQueryContext): boolean {
    const left = this.left instanceof GuidNode ? this.left.legacyStorageFormat() : this.left.evaluate(context)
    const right = this.right instanceof GuidNode ? this.right.legacyStorageFormat() : this.right.evaluate(context)

    return left !== right
  }
}