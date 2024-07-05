import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";

export default class LessThanNode extends BinaryOperatorNode {
  get name(): string {
    return `lt`
  }

  evaluate(context: IQueryContext): any {
    return this.left.evaluate(context) < this.right.evaluate(context)
  }
}