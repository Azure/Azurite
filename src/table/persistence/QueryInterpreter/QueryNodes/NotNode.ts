import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

export default class NotNode implements IQueryNode {
  constructor(public right: IQueryNode) { }

  evaluate(context: IQueryContext): any {
    return !this.right.evaluate(context)
  }

  toString(): string {
    return `(not ${this.right.toString()})`
  }
}