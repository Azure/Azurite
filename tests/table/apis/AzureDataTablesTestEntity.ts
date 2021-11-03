import { getUniqueName } from "../../testutils";

/**
 * Creates an entity for tests, with a randomized row key,
 * to avoid conflicts on inserts.
 *
 * @return {*}  {TestEntity}
 */
export function createBasicEntityForTest(
  partitionKey: string
): AzureDataTablesTestEntity {
  return new AzureDataTablesTestEntity(
    partitionKey,
    getUniqueName("row"),
    "value1"
  );
}

/**
 * This is the Entity Class used by Azure Data-Tables SDK tests
 *
 * @export
 * @class AzureDataTablesTestEntity
 */
export class AzureDataTablesTestEntity {
  public partitionKey: string;
  public rowKey: string;
  public myValue: string;
  public int32Field: number = 54321;
  public int64Field: string = "12345";
  public "Int64Field@odata.type": "Edm.Int64";
  public doubleField: number = 54.321;
  public "DoubleField@odate.type": "Edm.Double";
  constructor(part: string, row: string, value: string) {
    this.partitionKey = part;
    this.rowKey = row;
    this.myValue = value;
  }
}
