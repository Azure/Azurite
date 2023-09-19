import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

/**
 * Represents a typed value which can implement its own comparison logic.
 */
export default abstract class ValueNode implements IQueryNode {
  constructor(protected value: string) { }

  abstract get name(): string;

  evaluate(_context: IQueryContext): any {
    return this.value;
  }

  compare(context: IQueryContext, other: IQueryNode): number {
    const thisValue = this.evaluate(context);
    const otherValue = other.evaluate(context);

    if (thisValue === undefined || otherValue === undefined || otherValue === null) {
      return NaN;
    } else if (thisValue < otherValue) {
      return -1;
    } else if (thisValue > otherValue) {
      return 1;
    } else {
      return 0;
    }
  }

  toString(): string {
    return `(${this.name} ${this.value})`;
  }
}