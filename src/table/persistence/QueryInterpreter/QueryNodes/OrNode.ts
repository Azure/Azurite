import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";

/**
 * Represents a logical OR operation between two nodes.
 */
export default class OrNode extends BinaryOperatorNode {
  get name(): string {
    return `or`;
  }

  evaluate(context: IQueryContext): any {
    return this.left.evaluate(context) || this.right.evaluate(context);
  }
}