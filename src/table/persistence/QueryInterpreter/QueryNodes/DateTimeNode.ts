import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

/**
 * Represents a constant value of type `datetime` which is stored in its underlying JavaScript representation.
 * 
 * This is used to hold datetime values that are provided in the query (using the `datetime'...'` syntax)
 * and is used to ensure that these values are evaluated against their normalized ISO8601 format.
 */
export default class DateTimeNode<T> implements IQueryNode {
  constructor(private value: Date) { }

  get name(): string {
    return "datetime";
  }

  evaluate(_context: IQueryContext): any {
    return this.value.toISOString();
  }

  toString(): string {
    return `(${this.name} ${this.value.toISOString()})`;
  }
}