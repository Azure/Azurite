import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";

/**
 * Represents a logical less than operation between two nodes (the `lt` query operator).
 */
export default class LessThanNode extends BinaryOperatorNode {
  get name(): string {
    return `lt`;
  }

  evaluate(context: IQueryContext): any {
    return this.left.evaluate(context) < this.right.evaluate(context);
  }
}