import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";
import { TagContent } from "./IQueryNode";

export default class NotEqualsNode extends BinaryOperatorNode {
  get name(): string {
    return `ne`
  }

  evaluate(context: IQueryContext): TagContent[] {
    const leftContent = this.left.evaluate(context);
    const rightContent = this.right.evaluate(context);

    if (leftContent[0].value !== undefined
      && rightContent[0].value !== undefined
      && (leftContent[0].value !== rightContent[0].value)) {
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