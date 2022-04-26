import { getUniqueName } from "../../testutils";
import { AzureDataTablesTestEntity } from "./AzureDataTablesTestEntity";

/**
 * Creates an entity for tests, with a randomized row key,
 * to avoid conflicts on inserts.
 *
 * @return {*}  {TestEntity}
 */
export function createLargeEntityForTest(
  partitionKey: string
): LargeDataTablesTestEntity {
  return new LargeDataTablesTestEntity(
    partitionKey,
    getUniqueName("row"),
    "value1"
  );
}

/**
 * This is the Entity Class used by Azure Data-Tables SDK tests
 * It represents an entity whose body will be too large to send
 * in a single request.
 *
 * @export
 * @class AzureDataTablesTestEntity
 */
export class LargeDataTablesTestEntity extends AzureDataTablesTestEntity {
  public partitionKey: string;
  public rowKey: string;
  public myValue: string;
  // unable to use a record type to make this look more elegant, as
  // Record Type is incompatible with Table Storage EDM entity
  // https://docs.microsoft.com/en-us/rest/api/storageservices/understanding-the-table-service-data-model#property-types
  public bigString01a: string = "".padEnd(1024 * 32, "01");
  public bigString02a: string = "".padEnd(1024 * 32, "02");
  public bigString03a: string = "".padEnd(1024 * 32, "03");
  public bigString04a: string = "".padEnd(1024 * 32, "04");
  public bigString05a: string = "".padEnd(1024 * 32, "05");
  public bigString06a: string = "".padEnd(1024 * 32, "06");
  public bigString07a: string = "".padEnd(1024 * 32, "07");
  public bigString08a: string = "".padEnd(1024 * 32, "08");
  public bigString09a: string = "".padEnd(1024 * 32, "09");
  public bigString10a: string = "".padEnd(1024 * 32, "10");
  public bigString11a: string = "".padEnd(1024 * 32, "11");
  public bigString12a: string = "".padEnd(1024 * 32, "12");
  public bigString13a: string = "".padEnd(1024 * 32, "13");
  public bigString14a: string = "".padEnd(1024 * 32, "14");
  public bigString15a: string = "".padEnd(1024 * 32, "15");
  public bigString16a: string = "".padEnd(1024 * 32, "16");
  public bigString01b: string = "".padEnd(1024 * 32, "01");
  public bigString02b: string = "".padEnd(1024 * 32, "02");
  public bigString03b: string = "".padEnd(1024 * 32, "03");
  public bigString04b: string = "".padEnd(1024 * 32, "04");
  public bigString05b: string = "".padEnd(1024 * 32, "05");
  public bigString06b: string = "".padEnd(1024 * 32, "06");
  public bigString07b: string = "".padEnd(1024 * 32, "07");
  public bigString08b: string = "".padEnd(1024 * 32, "08");
  public bigString09b: string = "".padEnd(1024 * 32, "09");
  public bigString10b: string = "".padEnd(1024 * 32, "10");
  public bigString11b: string = "".padEnd(1024 * 32, "11");
  public bigString12b: string = "".padEnd(1024 * 32, "12");
  public bigString13b: string = "".padEnd(1024 * 32, "13");
  public bigString14b: string = "".padEnd(1024 * 32, "14");
  public bigString15b: string = "".padEnd(1024 * 32, "15");
  public bigString16b: string = "".padEnd(1024 * 32, "16");
  public bigString01c: string = "".padEnd(1024 * 32, "01");
  public bigString02c: string = "".padEnd(1024 * 32, "02");
  public bigString03c: string = "".padEnd(1024 * 32, "03");
  public bigString04c: string = "".padEnd(1024 * 32, "04");
  public bigString05c: string = "".padEnd(1024 * 32, "05");
  public bigString06c: string = "".padEnd(1024 * 32, "06");
  public bigString07c: string = "".padEnd(1024 * 32, "07");
  public bigString08c: string = "".padEnd(1024 * 32, "08");
  public bigString09c: string = "".padEnd(1024 * 32, "09");
  public bigString10c: string = "".padEnd(1024 * 32, "10");
  public bigString11c: string = "".padEnd(1024 * 32, "11");
  public bigString12c: string = "".padEnd(1024 * 32, "12");
  public bigString13c: string = "".padEnd(1024 * 32, "13");
  public bigString14c: string = "".padEnd(1024 * 32, "14");
  public bigString15c: string = "".padEnd(1024 * 32, "15");
  public bigString16c: string = "".padEnd(1024 * 32, "16");
  public bigString01d: string = "".padEnd(1024 * 32, "01");
  public bigString02d: string = "".padEnd(1024 * 32, "02");
  public bigString03d: string = "".padEnd(1024 * 32, "03");
  public bigString04d: string = "".padEnd(1024 * 32, "04");
  public bigString05d: string = "".padEnd(1024 * 32, "05");
  public bigString06d: string = "".padEnd(1024 * 32, "06");
  public bigString07d: string = "".padEnd(1024 * 32, "07");
  public bigString08d: string = "".padEnd(1024 * 32, "08");
  public bigString09d: string = "".padEnd(1024 * 32, "09");
  public bigString10d: string = "".padEnd(1024 * 32, "10");
  public bigString11d: string = "".padEnd(1024 * 32, "11");
  public bigString12d: string = "".padEnd(1024 * 32, "12");
  public bigString13d: string = "".padEnd(1024 * 32, "13");
  public bigString14d: string = "".padEnd(1024 * 32, "14");
  public bigString15d: string = "".padEnd(1024 * 32, "15");
  public bigString16d: string = "".padEnd(1024 * 32, "16");
  public bigString01aa: string = "".padEnd(1024 * 32, "01");
  public bigString02aa: string = "".padEnd(1024 * 32, "02");
  public bigString03aa: string = "".padEnd(1024 * 32, "03");
  public bigString04aa: string = "".padEnd(1024 * 32, "04");
  public bigString05aa: string = "".padEnd(1024 * 32, "05");
  public bigString06aa: string = "".padEnd(1024 * 32, "06");
  public bigString07aa: string = "".padEnd(1024 * 32, "07");
  public bigString08aa: string = "".padEnd(1024 * 32, "08");
  public bigString09aa: string = "".padEnd(1024 * 32, "09");
  public bigString10aa: string = "".padEnd(1024 * 32, "10");
  public bigString11aa: string = "".padEnd(1024 * 32, "11");
  public bigString12aa: string = "".padEnd(1024 * 32, "12");
  public bigString13aa: string = "".padEnd(1024 * 32, "13");
  public bigString14aa: string = "".padEnd(1024 * 32, "14");
  public bigString15aa: string = "".padEnd(1024 * 32, "15");
  public bigString16aa: string = "".padEnd(1024 * 32, "16");
  public bigString01ba: string = "".padEnd(1024 * 32, "01");
  public bigString02ba: string = "".padEnd(1024 * 32, "02");
  public bigString03ba: string = "".padEnd(1024 * 32, "03");
  public bigString04ba: string = "".padEnd(1024 * 32, "04");
  public bigString05ba: string = "".padEnd(1024 * 32, "05");
  public bigString06ba: string = "".padEnd(1024 * 32, "06");
  public bigString07ba: string = "".padEnd(1024 * 32, "07");
  public bigString08ba: string = "".padEnd(1024 * 32, "08");
  public bigString09ba: string = "".padEnd(1024 * 32, "09");
  public bigString10ba: string = "".padEnd(1024 * 32, "10");
  public bigString11ba: string = "".padEnd(1024 * 32, "11");
  public bigString12ba: string = "".padEnd(1024 * 32, "12");
  public bigString13ba: string = "".padEnd(1024 * 32, "13");
  public bigString14ba: string = "".padEnd(1024 * 32, "14");
  public bigString15ba: string = "".padEnd(1024 * 32, "15");
  public bigString16ba: string = "".padEnd(1024 * 32, "16");
  public bigString01ca: string = "".padEnd(1024 * 32, "01");
  public bigString02ca: string = "".padEnd(1024 * 32, "02");
  public bigString03ca: string = "".padEnd(1024 * 32, "03");
  public bigString04ca: string = "".padEnd(1024 * 32, "04");
  public bigString05ca: string = "".padEnd(1024 * 32, "05");
  public bigString06ca: string = "".padEnd(1024 * 32, "06");
  public bigString07ca: string = "".padEnd(1024 * 32, "07");
  public bigString08ca: string = "".padEnd(1024 * 32, "08");
  public bigString09ca: string = "".padEnd(1024 * 32, "09");
  public bigString10ca: string = "".padEnd(1024 * 32, "10");
  public bigString11ca: string = "".padEnd(1024 * 32, "11");
  public bigString12ca: string = "".padEnd(1024 * 32, "12");
  public bigString13ca: string = "".padEnd(1024 * 32, "13");
  public bigString14ca: string = "".padEnd(1024 * 32, "14");
  public bigString15ca: string = "".padEnd(1024 * 32, "15");
  public bigString16ca: string = "".padEnd(1024 * 32, "16");
  public bigString01da: string = "".padEnd(1024 * 32, "01");
  public bigString02da: string = "".padEnd(1024 * 32, "02");
  public bigString03da: string = "".padEnd(1024 * 32, "03");
  public bigString04da: string = "".padEnd(1024 * 32, "04");
  public bigString05da: string = "".padEnd(1024 * 32, "05");
  public bigString06da: string = "".padEnd(1024 * 32, "06");
  public bigString07da: string = "".padEnd(1024 * 32, "07");
  public bigString08da: string = "".padEnd(1024 * 32, "08");
  public bigString09da: string = "".padEnd(1024 * 32, "09");
  public bigString10da: string = "".padEnd(1024 * 32, "10");
  public bigString11da: string = "".padEnd(1024 * 32, "11");
  public bigString12da: string = "".padEnd(1024 * 32, "12");
  public bigString13da: string = "".padEnd(1024 * 32, "13");
  public bigString14da: string = "".padEnd(1024 * 32, "14");
  public bigString15da: string = "".padEnd(1024 * 32, "15");
  public bigString16da: string = "".padEnd(1024 * 32, "16");
  constructor(part: string, row: string, value: string) {
    super(part, row, value);
    this.partitionKey = part;
    this.rowKey = row;
    this.myValue = value;
  }
}
