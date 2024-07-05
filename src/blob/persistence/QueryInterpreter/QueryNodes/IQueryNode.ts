import { IQueryContext } from "../IQueryContext";

export default interface IQueryNode {
  get name(): string

  evaluate(context: IQueryContext): any

  toString(): string
}