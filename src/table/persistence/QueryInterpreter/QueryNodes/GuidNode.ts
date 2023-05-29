import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

/**
 * Represents a constant value of type GUID which can be compared against the base64 representation of the GUID
 * that is stored in the underlying table storage.
 * 
 * NOTE: This node type also exposes a `legacyStorageFormat()` method which returns the GUID in its string representation
 *       for backwards compatibility with the legacy table storage format.
 */
export default class GuidNode<T> implements IQueryNode {
  constructor(private value: string) { }

  get name(): string {
    return "guid";
  }

  evaluate(_context: IQueryContext): any {
    return Buffer.from(this.value).toString("base64");
  }

  legacyStorageFormat(): string {
    return this.value;
  }

  toString(): string {
    return `(${this.name} ${this.value})`;
  }
}