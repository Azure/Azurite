/**
 * A test entity in the format of the repro for #1259
 */
export class TestBooleanPropEntity {
  partitionKey = "";
  rowKey = "";
  prop = { value: "false", type: "Boolean" };
  int32Prop = { value: "32", type: "Int32" };
}
