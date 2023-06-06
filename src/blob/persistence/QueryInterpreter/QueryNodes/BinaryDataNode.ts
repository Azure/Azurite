import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

export default class BinaryNode<T> implements IQueryNode {
  constructor(private value: string) { }

  get name(): string {
    return "binary"
  }

  evaluate(_context: IQueryContext): any {
    return Buffer.from(this.value, "hex").toString("base64")
  }

  toString(): string {
    return `(${this.name} ${this.value})`
  }
}