import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";

export default class LessThanNode extends BinaryOperatorNode {
  get name(): string {
    return `lt`
  }

  evaluate(context: IQueryContext): any {
    const leftContent = this.left.evaluate(context);
    const rightContent = this.right.evaluate(context);

    if (leftContent[0].value !== undefined
      && rightContent[0].value !== undefined
      && (leftContent[0].value < rightContent[0].value)) {
      if (leftContent[0].key !== undefined) {
        return leftContent;
      }
      else {
        return rightContent;
      }
    }
    else {
      return [];
    }
  }
}