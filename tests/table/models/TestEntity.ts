/**
 * Provides the default entity we use for Table tests
 *
 * @export
 * @class TestEntity
 */
export class TestEntity {
  public partitionKey: string;
  public rowKey: string;
  public myValue: string;

  constructor(part: string, row: string, value: string) {
    this.partitionKey = part;
    this.rowKey = row;
    this.myValue = value;
  }
}
