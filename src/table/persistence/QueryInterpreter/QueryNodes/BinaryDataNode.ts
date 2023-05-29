import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

/**
 * Represents a constant value which should be decoded from its `hex` representation
 * and encoded as `base64` to match the underlying table storage format.
 */
export default class BinaryNode<T> implements IQueryNode {
  constructor(private value: string) { }

  get name(): string {
    return "binary";
  }

  evaluate(_context: IQueryContext): any {
    return Buffer.from(this.value, "hex").toString("base64");
  }

  toString(): string {
    return `(${this.name} ${this.value})`;
  }
}