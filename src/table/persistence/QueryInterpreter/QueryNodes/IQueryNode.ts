import { IQueryContext } from "../IQueryContext";

/**
 * The base interface for all query nodes.
 */
export default interface IQueryNode {
  get name(): string;

  evaluate(context: IQueryContext): any;

  toString(): string;
}