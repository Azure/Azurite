import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

export default class ExpressionNode implements IQueryNode {
  constructor(public child: IQueryNode) { }

  evaluate(context: IQueryContext): any {
    return this.child.evaluate(context)
  }

  toString(): string {
    return `(${this.child.toString()})`
  }
}