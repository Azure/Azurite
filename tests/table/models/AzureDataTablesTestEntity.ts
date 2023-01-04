import { Edm } from "@azure/data-tables";
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
 * https://docs.microsoft.com/en-us/rest/api/storageservices/payload-format-for-table-service-operations
 * @export
 * @class AzureDataTablesTestEntity
 */
export class AzureDataTablesTestEntity {
  public partitionKey: string;
  public rowKey: string;
  public myValue: string;
  public int32Field: number = 54321;
  public int64Field: Edm<"Int64"> = { value: "12345", type: "Int64" };
  public doubleField: Edm<"Double"> = { value: 54.321, type: "Double" };
  public guidField: Edm<"Guid"> = { value: "", type: "Guid" };
  public nullableString: string | null = "notNull";
  public binaryField: Buffer = Buffer.from("11111111");
  public booleanField: boolean = true;
  public dateField: Edm<"DateTime"> = { value: "2023-01-01T23:00:00", type: "DateTime" };
  constructor(part: string, row: string, value: string) {
    this.partitionKey = part;
    this.rowKey = row;
    this.myValue = value;
  }
}
