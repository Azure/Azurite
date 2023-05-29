import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";
import GuidNode from "./GuidNode";

export default class NotEqualsNode extends BinaryOperatorNode {
  get name(): string {
    return `ne`
  }

  evaluate(context: IQueryContext): any {
    if (!this.backwardsCompatibleGuidEvaluate(context)) {
      return false;
    }

    const left = this.left.evaluate(context);
    const right = this.right.evaluate(context);

    // If either side is undefined, we should not match - this only occurs in scenarios where
    // the field itself doesn't exist on the entity.
    return left !== right && left !== undefined && right !== undefined;
  }

  private backwardsCompatibleGuidEvaluate(context: IQueryContext): boolean {
    const left = this.left instanceof GuidNode ? this.left.legacyStorageFormat() : this.left.evaluate(context)
    const right = this.right instanceof GuidNode ? this.right.legacyStorageFormat() : this.right.evaluate(context)

    return left !== right
  }
}