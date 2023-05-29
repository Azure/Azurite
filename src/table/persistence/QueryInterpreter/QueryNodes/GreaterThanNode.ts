import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";

/**
 * Represents a logical greater than operation between two nodes (the `gt` query operator).
 */
export default class GreaterThanNode extends BinaryOperatorNode {
  get name(): string {
    return `gt`;
  }

  evaluate(context: IQueryContext): any {
    return this.left.evaluate(context) > this.right.evaluate(context);
  }
}