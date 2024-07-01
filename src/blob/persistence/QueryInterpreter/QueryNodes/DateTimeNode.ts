import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

export default class DateTimeNode<T> implements IQueryNode {
  constructor(private value: Date) { }

  get name(): string {
    return "datetime"
  }

  evaluate(_context: IQueryContext): any {
    return this.value.toISOString()
  }

  toString(): string {
    return `(${this.name} ${this.value.toISOString()})`
  }
}