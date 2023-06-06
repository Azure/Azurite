import { IQueryContext, isTable } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

export default class TableNameNode implements IQueryNode {
  get name(): string {
    return "TableName"
  }

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