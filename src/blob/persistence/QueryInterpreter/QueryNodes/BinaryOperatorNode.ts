import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

export default abstract class BinaryOperatorNode implements IQueryNode {
  constructor(public left: IQueryNode, public right: IQueryNode) { }

  abstract evaluate(context: IQueryContext): any

  abstract get name(): string

  toString(): string {
    return `(${this.name} ${this.left.toString()} ${this.right.toString()})`
  }
}