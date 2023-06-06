import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";
import { TagContent } from "./IQueryNode";

export default class AndNode extends BinaryOperatorNode {
  get name(): string {
    return `and`
  }

  evaluate(context: IQueryContext): TagContent[] {
    const leftContent = this.left.evaluate(context);
    const rightContent = this.right.evaluate(context);
    if (leftContent.length !== 0 && rightContent.length !== 0) {
      return leftContent.concat(rightContent);
    }
    else {
      return [];
    }
  }
}