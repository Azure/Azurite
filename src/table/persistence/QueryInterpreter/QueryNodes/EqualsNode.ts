import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";
import GuidNode from "./GuidNode";

export default class EqualsNode extends BinaryOperatorNode {
  get name(): string {
    return `eq`
  }

  evaluate(context: IQueryContext): any {
    if (this.backwardsCompatibleGuidEvaluate(context)) {
      return true
    }

    return this.left.evaluate(context) === this.right.evaluate(context)
  }

  private backwardsCompatibleGuidEvaluate(context: IQueryContext): boolean {
    const left = this.left instanceof GuidNode ? this.left.stringGuid() : this.left.evaluate(context)
    const right = this.right instanceof GuidNode ? this.right.stringGuid() : this.right.evaluate(context)

    return left === right
  }
}