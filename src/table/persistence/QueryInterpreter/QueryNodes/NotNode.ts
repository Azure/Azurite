import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

/**
 * Represents a unary "not" operation within the query.
 */
export default class NotNode implements IQueryNode {
  constructor(public right: IQueryNode) { }

  get name(): string {
    return "not";
  }

  evaluate(context: IQueryContext): any {
    return !this.right.evaluate(context);
  }

  toString(): string {
    return `(${this.name} ${this.right.toString()})`;
  }
}