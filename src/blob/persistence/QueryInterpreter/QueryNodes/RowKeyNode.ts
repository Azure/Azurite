import { IQueryContext, isEntity } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

export default class RowKeyNode implements IQueryNode {
  get name(): string {
    return "RowKey"
  }

  evaluate(context: IQueryContext): any {
    if (isEntity(context)) {
      return context.RowKey
    }

    return null
  }

  toString(): string {
    return `RowKey`
  }
}