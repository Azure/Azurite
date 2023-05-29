import { IQueryContext } from "../IQueryContext";
import BinaryOperatorNode from "./BinaryOperatorNode";

/**
 * Represents a logical OR operation between two nodes.
 * 
 * This is used in queries which resemble the following:
 * 
 *   (PartitionKey eq 'foo') or (RowKey eq 'bar')
 * 
 * In this case, the `OrNode` would be the root node, with the left and right nodes
 * corresponding to `(PartitionKey eq 'foo')` and `(RowKey eq 'bar')`, respectively.
 */
export default class OrNode extends BinaryOperatorNode {
  get name(): string {
    return `or`;
  }

  evaluate(context: IQueryContext): any {
    return this.left.evaluate(context) || this.right.evaluate(context);
  }
}