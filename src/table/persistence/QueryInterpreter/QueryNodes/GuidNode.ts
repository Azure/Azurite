import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

export default class GuidNode<T> implements IQueryNode {
  constructor(private value: string) { }

  evaluate(_context: IQueryContext): any {
    return Buffer.from(this.value).toString("base64")
  }

  stringGuid(): string {
    return this.value
  }

  toString(): string {
    return `(guid ${this.value})`
  }
}