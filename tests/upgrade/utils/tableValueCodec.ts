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

/**
 * Unwraps a `{ value, type }` OData-typed property and asserts its `type`
 * matches `expectedType`, failing loudly if the property wasn't wrapped at
 * all. `fetched` must come from a `getEntity`/`listEntities` call made with
 * `{ disableTypeConversion: true }` (see callers), which is what makes the
 * SDK return every property this way instead of silently collapsing lost
 * `@odata.type` annotations to a same-looking plain string.
 */
function unwrapAndAssertType(
  value: unknown,
  expectedType: string,
  propertyName: string
): unknown {
  const isWrapped =
    value !== null &&
    typeof value === "object" &&
    "type" in (value as Record<string, unknown>) &&
    "value" in (value as Record<string, unknown>);
  assert.ok(
    isWrapped,
    `${propertyName} lost its @odata.type annotation across the upgrade - expected an { value, type: "${expectedType}" } wrapper (queried with disableTypeConversion: true), got: ${JSON.stringify(
      value
    )}`
  );
  const { value: unwrapped, type } = value as { value: unknown; type: string };
  assert.strictEqual(
    type,
    expectedType,
    `${propertyName}'s @odata.type annotation changed across the upgrade`
  );
  return unwrapped;
}

/**
 * Asserts a fetched entity matches every typed property of the fixture it
 * was created from, including each property's EDM `@odata.type` - not just
 * its value. `fetched` must come from a `getEntity` call made with
 * `{ disableTypeConversion: true }`, otherwise a dropped type annotation
 * (e.g. Int64 silently becoming a plain string) would still compare equal
 * and this regression would go undetected.
 */
export function assertEntityMatchesFixture(
  fetched: Record<string, unknown>,
  entity: TableEntityFixture
): void {
  assert.strictEqual(
    unwrapAndAssertType(fetched.stringProp, "String", "stringProp"),
    entity.stringProp
  );
  // disableTypeConversion returns every value pre-conversion, i.e. as the
  // raw wire string (e.g. "42", "true") rather than a native number/boolean
  // - convert before comparing against the fixture's native-typed value.
  assert.strictEqual(
    Number(unwrapAndAssertType(fetched.int32Prop, "Int32", "int32Prop")),
    entity.int32Prop
  );
  assert.strictEqual(
    String(unwrapAndAssertType(fetched.int64Prop, "Int64", "int64Prop")),
    entity.int64Prop
  );
  assert.strictEqual(
    Number(unwrapAndAssertType(fetched.doubleProp, "Double", "doubleProp")),
    entity.doubleProp
  );
  assert.strictEqual(
    String(unwrapAndAssertType(fetched.boolProp, "Boolean", "boolProp")) ===
      "true",
    entity.boolProp
  );
  // @azure/data-tables returns DateTime properties as `Date` objects, but
  // fall back to string-parsing defensively rather than assuming the shape.
  const rawDate = unwrapAndAssertType(fetched.dateProp, "DateTime", "dateProp");
  const fetchedDate =
    rawDate instanceof Date ? rawDate : new Date(rawDate as string);
  assert.strictEqual(fetchedDate.getTime(), entity.dateProp.getTime());
  assert.strictEqual(
    unwrapAndAssertType(fetched.guidProp, "Guid", "guidProp"),
    entity.guidProp
  );
  // The SDK may return Binary properties as raw bytes or a base64 string
  // depending on serialization shape - normalize before comparing.
  const fetchedBinary = unwrapAndAssertType(
    fetched.binaryProp,
    "Binary",
    "binaryProp"
  );
  const fetchedBinaryBuffer =
    typeof fetchedBinary === "string"
      ? Buffer.from(fetchedBinary, "base64")
      : Buffer.from(fetchedBinary as Uint8Array);
  assert.deepStrictEqual(fetchedBinaryBuffer, Buffer.from(entity.binaryProp));
}
