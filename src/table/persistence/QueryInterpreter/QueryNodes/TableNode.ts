import { IQueryContext, isTable } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

export default class TableNode implements IQueryNode {
  evaluate(context: IQueryContext): any {
    if (isTable(context)) {
      return context.table
    }

    return null
  }

  toString(): string {
    return `TableName`
  }
}