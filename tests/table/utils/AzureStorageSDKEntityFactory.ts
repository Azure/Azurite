import { getUniqueName } from "../../testutils";
import { TestEntity } from "../models/TestEntity";

export class AzureStorageSDKEntityFactory {
  /**
   * Creates an entity for tests, with a randomized row key,
   * to avoid conflicts on inserts.
   *
   * @return {*}  {TestEntity}
   */
  public createBasicEntityForTest(): TestEntity {
    return new TestEntity("part1", getUniqueName("row"), "value1");
  }
}
