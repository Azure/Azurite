import { IQueryContext, isEntity, isTable } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

/**
 * Represents a reference to an identifier (such as a property, or a table name).
 * 
 * This node, when evaluated, will retrieve the corresponding value from the context.
 */
export default class IdentifierNode implements IQueryNode {
  constructor(private identifier: string) { }

  get name(): string {
    return "id";
  }

  evaluate(context: IQueryContext): any {
    if (isEntity(context)) {
      if (this.identifier === "PartitionKey") {
        return context.PartitionKey;
      } else if (this.identifier === "RowKey") {
        return context.RowKey;
      }

      return context.properties[this.identifier];
    } else if (isTable(context)) {
      if (this.identifier.toLowerCase() === "tablename") {
        return context.table;
      }

      throw new Error(`Property queries cannot be used in this query context.`);
    }
  }

  toString(): string {
    return `(${this.name} ${this.identifier})`;
  }
}