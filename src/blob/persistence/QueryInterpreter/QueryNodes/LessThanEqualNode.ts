import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";

export default class LessThanEqualNode extends BinaryOperatorNode {
  get name(): string {
    return `lte`
  }

  evaluate(context: IQueryContext): any {
    return this.left.evaluate(context) <= this.right.evaluate(context)
  }
}