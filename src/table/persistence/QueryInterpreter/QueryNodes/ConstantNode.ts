import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

export default class ConstantNode<T> implements IQueryNode {
  constructor(private value: T) { }

  get name(): string {
    return "constant"
  }

  evaluate(_context: IQueryContext): T {
    return this.value
  }

  toString(): string {
    return JSON.stringify(this.value)
  }
}