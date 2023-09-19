import { IQueryContext } from "../IQueryContext";
import ValueNode from "./ValueNode";

/**
 * Represents a constant value which should be decoded from its `hex` representation
 * and encoded as `base64` to match the underlying table storage format.
 * 
 * This is used to hold binary values that are provided in the query (using the `binary'...'` syntax)
 * and is used to ensure that these values are evaluated against their normalized base64 format. For
 * example, the query `PartitionKey eq binary'0011'` would contain a `BinaryNode` with the value `0x0011`.
 */
export default class BinaryNode extends ValueNode {
  get name(): string {
    return "binary";
  }

  evaluate(_context: IQueryContext): any {
    return Buffer.from(this.value, "hex").toString("base64");
  }
}