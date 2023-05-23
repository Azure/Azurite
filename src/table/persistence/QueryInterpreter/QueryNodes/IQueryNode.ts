import { IQueryContext } from "../IQueryContext";

export default interface IQueryNode {
  evaluate(context: IQueryContext): any

  toString(): string
}