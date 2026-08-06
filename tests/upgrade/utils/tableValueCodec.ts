import * as assert from "assert";
import { TableEntityFixture } from "./dataFixtures";

/**
 * Builds the wire-format object accepted by `TableClient.createEntity`,
 * wrapping the OData-typed properties (Int64/Guid/Binary) the way
 * `@azure/data-tables` expects. Shared so every scenario that seeds table
 * fixtures (npm process, Docker, ...) exercises the same typed-property set.
 */
export function toCreateEntityPayload(entity: TableEntityFixture) {
  return {
    partitionKey: entity.partitionKey,
    rowKey: entity.rowKey,
    stringProp: entity.stringProp,
    int32Prop: entity.int32Prop,
    int64Prop: { value: entity.int64Prop, type: "Int64" as const },
    doubleProp: entity.doubleProp,
    boolProp: entity.boolProp,
    dateProp: entity.dateProp,
    guidProp: { value: entity.guidProp, type: "Guid" as const },
    // The explicit `{ value, type: "Binary" }` OData annotation expects
    // value to already be base64-encoded (unlike passing a raw Buffer as a
    // plain property, which the SDK would auto-encode) - encoding it here
    // avoids sending an un-serializable Buffer object and an InvalidInput
    // error from the service.
    binaryProp: {
      value: Buffer.from(entity.binaryProp).toString("base64"),
      type: "Binary" as const
    }
  };
}

/**
 * `@azure/data-tables` returns some OData-typed properties (Guid, Binary,
 * Int64) wrapped as `{ type, value }` rather than plain values. Unwrap so
 * comparisons work regardless of which shape the SDK chooses to return.
 */
export function unwrapTypedValue(value: unknown): unknown {
  if (
    value !== null &&
    typeof value === "object" &&
    "type" in (value as Record<string, unknown>) &&
    "value" in (value as Record<string, unknown>)
  ) {
    return (value as { value: unknown }).value;
  }
  return value;
}

/** Asserts a fetched entity matches every typed property of the fixture it was created from. */
export function assertEntityMatchesFixture(
  fetched: Record<string, unknown>,
  entity: TableEntityFixture
): void {
  assert.strictEqual(fetched.stringProp, entity.stringProp);
  assert.strictEqual(fetched.int32Prop, entity.int32Prop);
  assert.strictEqual(
    String(unwrapTypedValue(fetched.int64Prop)),
    entity.int64Prop
  );
  assert.strictEqual(fetched.doubleProp, entity.doubleProp);
  assert.strictEqual(fetched.boolProp, entity.boolProp);
  // @azure/data-tables returns DateTime properties as `Date` objects, but
  // fall back to string-parsing defensively rather than assuming the shape.
  const fetchedDate =
    fetched.dateProp instanceof Date
      ? fetched.dateProp
      : new Date(fetched.dateProp as string);
  assert.strictEqual(fetchedDate.getTime(), entity.dateProp.getTime());
  assert.strictEqual(unwrapTypedValue(fetched.guidProp), entity.guidProp);
  // The SDK may return Binary properties as raw bytes or a base64 string
  // depending on serialization shape - normalize before comparing.
  const fetchedBinary = unwrapTypedValue(fetched.binaryProp);
  const fetchedBinaryBuffer =
    typeof fetchedBinary === "string"
      ? Buffer.from(fetchedBinary, "base64")
      : Buffer.from(fetchedBinary as Uint8Array);
  assert.deepStrictEqual(fetchedBinaryBuffer, Buffer.from(entity.binaryProp));
}
