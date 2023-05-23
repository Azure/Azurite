import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

export default class DateTimeNode<T> implements IQueryNode {
  constructor(private value: Date) { }

  evaluate(_context: IQueryContext): any {
    return this.value.toISOString()
  }

  toString(): string {
    return `(datetime ${this.value.toISOString()})`
  }
}