import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

export default class KeyNode implements IQueryNode {
  constructor(private identifier: string) { }

  get name(): string {
    return "id"
  }

  evaluate(context: IQueryContext): any {
    return context[this.identifier]
  }

  toString(): string {
    return `(${this.name} ${this.identifier})`
  }
}