import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

/**
 * Represents a constant value of type `datetime` which is stored in its underlying JavaScript representation.
 * 
 * This is used to hold datetime values that are provided in the query (using the `datetime'...'` syntax)
 * and is used to ensure that these values are evaluated against their normalized ISO8601 format. For example,
 * the query `PartitionKey eq datetime'2019-01-01T00:00:00.000Z'` would contain a `DateTimeNode` with the value
 * `2019-01-01T00:00:00.000Z`.
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