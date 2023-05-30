import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";
import GuidNode from "./GuidNode";

/**
 * Represents a logical equality operation between two nodes (the `eq` query operator).
 * 
 * This is used in queries which resemble the following:
 * 
 *  PartitionKey eq 'foo'
 * 
 * In this case, the `EqualsNode` would be the root node, with the left and right nodes
 * corresponding to the identifier `PartitionKey` and the constant `foo`, respectively.
 * 
 * NOTE: This operation includes backwards compatibility for the `guid` type hint, since
 *       earlier versions of Azurite stored guid values in their raw string format.
 */
export default class EqualsNode extends BinaryOperatorNode {
  get name(): string {
    return `eq`;
  }

  evaluate(context: IQueryContext): any {
    return this.left.evaluate(context) === this.right.evaluate(context) || this.backwardsCompatibleGuidEvaluate(context);
  }

  private backwardsCompatibleGuidEvaluate(context: IQueryContext): boolean {
    const left = this.left instanceof GuidNode ? this.left.legacyStorageFormat() : this.left.evaluate(context);
    const right = this.right instanceof GuidNode ? this.right.legacyStorageFormat() : this.right.evaluate(context);

    return left === right;
  }
}