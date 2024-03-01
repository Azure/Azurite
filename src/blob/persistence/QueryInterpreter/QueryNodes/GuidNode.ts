import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

export default class GuidNode<T> implements IQueryNode {
  constructor(private value: string) { }

  get name(): string {
    return "guid"
  }

  evaluate(_context: IQueryContext): any {
    return Buffer.from(this.value).toString("base64")
  }

  stringGuid(): string {
    return this.value
  }

  toString(): string {
    return `(${this.name} ${this.value})`
  }
}