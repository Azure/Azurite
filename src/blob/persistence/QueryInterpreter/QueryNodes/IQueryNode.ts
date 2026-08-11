import { IQueryContext } from "../IQueryContext";

export interface TagContent {
  key?: string;
  value?: string;
}

export default interface IQueryNode {
  get name(): string

  evaluate(context: IQueryContext): TagContent[]

  toString(): string
}