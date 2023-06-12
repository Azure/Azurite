import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

/**
 * Represents a binary operator node in a query tree.
 * 
 * NOTE: This is an abstract class from which various other binary operator nodes are derived,
 *       such as AndNode and OrNode. It is used to enable easier traversal of the tree when
 *      performing validations etc.
 */
export default abstract class BinaryOperatorNode implements IQueryNode {
  constructor(public left: IQueryNode, public right: IQueryNode) { }

  abstract evaluate(context: IQueryContext): any;

  abstract get name(): string;

  toString(): string {
    return `(${this.name} ${this.left.toString()} ${this.right.toString()})`;
  }
}