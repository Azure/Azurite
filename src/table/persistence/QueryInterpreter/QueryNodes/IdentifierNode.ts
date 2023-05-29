import { IQueryContext, isEntity, isTable } from "../IQueryContext";
import IQueryNode from "./IQueryNode";

/**
 * Represents a reference to an identifier (such as a property, or a table name).
 * 
 * This is used in queries which resemble the following:
 * 
 *   PartitionKey eq 'foo'
 * 
 * In this case, the expression `PartitionKey` would be represented by an `IdentifierNode`
 * with the identifier `PartitionKey`.
 * 
 * This node, when evaluated, will retrieve the corresponding value from the context. The
 * specific behavior depends on the context type:
 *  - If the context is an entity, the identifier will be used to retrieve the corresponding
 *    partition key, row key, or property value from the entity.
 *  - If the context is a table, the identifier will be used to retrieve the corresponding
 *    table name from the table (or will raise an error if the identifier is not `TableName`).
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