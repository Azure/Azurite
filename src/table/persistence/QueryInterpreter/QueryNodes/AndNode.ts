import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";

/**
 * Represents a logical AND operation between two nodes.
 */
export default class AndNode extends BinaryOperatorNode {
  get name(): string {
    return `and`;
  }

  evaluate(context: IQueryContext): any {
    return this.left.evaluate(context) && this.right.evaluate(context);
  }
}