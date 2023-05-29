import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";

/**
 * Represents a logical less than or equal operation between two nodes (the `le` query operator).
 */
export default class LessThanEqualNode extends BinaryOperatorNode {
  get name(): string {
    return `le`
  }

  evaluate(context: IQueryContext): any {
    return this.left.evaluate(context) <= this.right.evaluate(context)
  }
}