import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";

export default class GreaterThanEqualNode extends BinaryOperatorNode {
  get name(): string {
    return `gte`
  }

  evaluate(context: IQueryContext): any {
    return this.left.evaluate(context) >= this.right.evaluate(context)
  }
}