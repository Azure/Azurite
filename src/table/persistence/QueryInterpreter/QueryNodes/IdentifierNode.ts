import { IQueryContext, isEntity } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

export default class IdentifierNode implements IQueryNode {
  constructor(private identifier: string) { }

  evaluate(context: IQueryContext): any {
    if (isEntity(context)) {
      if (this.identifier === "PartitionKey") {
        return context.PartitionKey
      } else if (this.identifier === "RowKey") {
        return context.RowKey
      }

      return context.properties[this.identifier]
    }
  }

  toString(): string {
    return `(id ${this.identifier})`
  }
}