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
    const otherValue = other.evaluate(context);
    if (this.value < otherValue) {
      return -1;
    } else if (this.value > otherValue) {
      return 1;
    } else {
      return 0;
    }
  }

  toString(): string {
    return `(${this.name} ${this.value})`;
  }
}