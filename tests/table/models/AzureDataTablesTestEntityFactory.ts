import { Edm } from "@azure/data-tables";
import { getUniqueName } from "../../testutils";

/**
 * This is the Entity Factory used by Azure Data-Tables SDK tests
 * https://docs.microsoft.com/en-us/rest/api/storageservices/payload-format-for-table-service-operations
 * @class AzureDataTablesTestEntityFactory
 */
export class AzureDataTablesTestEntityFactory {
  private int32Field: number = 54321;
  private int64Field: Edm<"Int64"> = { value: "12345", type: "Int64" };
  private doubleField: Edm<"Double"> = { value: 54.321, type: "Double" };
  private nullableString: string | null = "notNull";
  private binaryField: Buffer = Buffer.from("11111111");
  private booleanField: boolean = true;
  private newGuid(): Edm<"Guid"> {
    return {
      value: "d3365292-0f33-4e13-9ec6-2ea5053c32ad",
      type: "Guid"
    };
  }
  private newDateField(): Edm<"DateTime"> {
    return {
      value: "2023-01-01T23:00:00",
      type: "DateTime"
    };
  }
  public Create(part: string, row: string, value: string): TableTestEntity {
    return {
      partitionKey: part,
      rowKey: row,
      myValue: value,
      int32Field: this.int32Field,
      int64Field: this.int64Field,
      doubleField: this.doubleField,
      guidField: this.newGuid(),
      nullableString: this.nullableString,
      binaryField: this.binaryField,
      booleanField: this.booleanField,
      dateField: this.newDateField()
    };
  }

  /**
   * Creates an entity for tests, with a randomized row key,
   * to avoid conflicts on inserts.
   *
   * @return {*}  {TestEntity}
   */
  public createBasicEntityForTest(partitionKey: string): TableTestEntity {
    return this.Create(partitionKey, getUniqueName("row"), "value1");
  }
}

export interface TableTestEntity {
  partitionKey: string;
  rowKey: string;
  myValue: string;
  int32Field: number;
  int64Field: Edm<"Int64">;
  doubleField: Edm<"Double">;
  guidField: Edm<"Guid">;
  nullableString: string | null;
  binaryField: Buffer;
  booleanField: boolean;
  dateField: Edm<"DateTime">;
}
