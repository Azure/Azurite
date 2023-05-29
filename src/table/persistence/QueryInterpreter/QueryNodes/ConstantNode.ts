import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

/**
 * Represents a constant value which is stored in its underlying JavaScript representation.
 * 
 * This is used to hold boolean, number, and string values that are provided in the query.
 */
export default class ConstantNode<T> implements IQueryNode {
  constructor(private value: T) { }

  get name(): string {
    return "constant";
  }

  evaluate(_context: IQueryContext): T {
    return this.value;
  }

  toString(): string {
    return JSON.stringify(this.value);
  }
}