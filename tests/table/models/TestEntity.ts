import * as Azure from "azure-storage";
const eg = Azure.TableUtilities.entityGenerator;

/**
 * Provides the default entity we use for Table tests
 *
 * @export
 * @class TestEntity
 */
export class TestEntity {
  public PartitionKey: Azure.TableUtilities.entityGenerator.EntityProperty<string>;
  public RowKey: Azure.TableUtilities.entityGenerator.EntityProperty<string>;
  public myValue: Azure.TableUtilities.entityGenerator.EntityProperty<string>;
  constructor(part: string, row: string, value: string) {
    this.PartitionKey = eg.String(part);
    this.RowKey = eg.String(row);
    this.myValue = eg.String(value);
  }
}
