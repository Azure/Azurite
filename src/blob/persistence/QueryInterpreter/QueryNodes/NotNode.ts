import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

export default class NotNode implements IQueryNode {
  constructor(public right: IQueryNode) { }

  get name(): string {
    return "not"
  }

  evaluate(context: IQueryContext): any {
    return !this.right.evaluate(context)
  }

  toString(): string {
    return `(${this.name} ${this.right.toString()})`
  }
}