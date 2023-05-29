import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";

/**
 * Represents a logical greater than or equal operation between two nodes (the `gte` query operator).
 */
export default class GreaterThanEqualNode extends BinaryOperatorNode {
  get name(): string {
    return `ge`;
  }

  evaluate(context: IQueryContext): any {
    return this.left.evaluate(context) >= this.right.evaluate(context);
  }
}