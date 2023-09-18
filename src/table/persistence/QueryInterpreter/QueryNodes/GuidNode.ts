import { IQueryContext } from "../IQueryContext";
import IQueryNode from "./IQueryNode";
import ValueNode from "./ValueNode";

/**
 * Represents a constant value of type GUID which can be compared against the base64 representation of the GUID
 * that is stored in the underlying table storage.
 * 
 * This is used to hold GUID values that are provided in the query (using the `guid'...'` syntax), for example
 * the query `PartitionKey eq guid'00112233-4455-6677-8899-aabbccddeeff'` would contain a `GuidNode` with the value
 * `00112233-4455-6677-8899-aabbccddeeff`.
 * 
 * NOTE: This node type also exposes a `legacyStorageFormat()` method which returns the GUID in its string representation
 *       for backwards compatibility with the legacy table storage format.
 */
export default class GuidNode<T> extends ValueNode {
  get name(): string {
    return "guid";
  }

  evaluate(_context: IQueryContext): any {
    return Buffer.from(this.value).toString("base64");
  }

  compare(context: IQueryContext, other: IQueryNode): number {
    const otherValue = other.evaluate(context);
    let thisValue = this.value;

    // If the other value is not in its raw GUID format, then let's convert this value to its base64 representation
    if (!/^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(otherValue)) {
      thisValue = Buffer.from(this.value).toString("base64");
    }

    if (!thisValue || !otherValue) {
      return NaN;
    } else if (thisValue < otherValue) {
      return -1;
    } else if (thisValue > otherValue) {
      return 1;
    } else {
      return 0;
    }
  }
}