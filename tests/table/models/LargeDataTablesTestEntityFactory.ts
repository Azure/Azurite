import { getUniqueName } from "../../testutils";
import {
  AzureDataTablesTestEntityFactory,
  TableTestEntity
} from "./AzureDataTablesTestEntityFactory";

/**
 * This is the Entity Class used by Azure Data-Tables SDK tests
 * It represents an entity whose body will be too large to send
 * in a single request.
 *
 * @export
 * @class AzureDataTablesTestEntity
 */
export class LargeDataTablesTestEntityFactory extends AzureDataTablesTestEntityFactory {
  // unable to use a record type to make this look more elegant, as
  // Record Type is incompatible with Table Storage EDM entity
  // https://docs.microsoft.com/en-us/rest/api/storageservices/understanding-the-table-service-data-model#property-types
  largeEntityProps = {
    bigString01a: "".padEnd(1024 * 32, "01"),
    bigString02a: "".padEnd(1024 * 32, "02"),
    bigString03a: "".padEnd(1024 * 32, "03"),
    bigString04a: "".padEnd(1024 * 32, "04"),
    bigString05a: "".padEnd(1024 * 32, "05"),
    bigString06a: "".padEnd(1024 * 32, "06"),
    bigString07a: "".padEnd(1024 * 32, "07"),
    bigString08a: "".padEnd(1024 * 32, "08"),
    bigString09a: "".padEnd(1024 * 32, "09"),
    bigString10a: "".padEnd(1024 * 32, "10"),
    bigString11a: "".padEnd(1024 * 32, "11"),
    bigString12a: "".padEnd(1024 * 32, "12"),
    bigString13a: "".padEnd(1024 * 32, "13"),
    bigString14a: "".padEnd(1024 * 32, "14"),
    bigString15a: "".padEnd(1024 * 32, "15"),
    bigString16a: "".padEnd(1024 * 32, "16"),
    bigString01b: "".padEnd(1024 * 32, "01"),
    bigString02b: "".padEnd(1024 * 32, "02"),
    bigString03b: "".padEnd(1024 * 32, "03"),
    bigString04b: "".padEnd(1024 * 32, "04"),
    bigString05b: "".padEnd(1024 * 32, "05"),
    bigString06b: "".padEnd(1024 * 32, "06"),
    bigString07b: "".padEnd(1024 * 32, "07"),
    bigString08b: "".padEnd(1024 * 32, "08"),
    bigString09b: "".padEnd(1024 * 32, "09"),
    bigString10b: "".padEnd(1024 * 32, "10"),
    bigString11b: "".padEnd(1024 * 32, "11"),
    bigString12b: "".padEnd(1024 * 32, "12"),
    bigString13b: "".padEnd(1024 * 32, "13"),
    bigString14b: "".padEnd(1024 * 32, "14"),
    bigString15b: "".padEnd(1024 * 32, "15"),
    bigString16b: "".padEnd(1024 * 32, "16"),
    bigString01c: "".padEnd(1024 * 32, "01"),
    bigString02c: "".padEnd(1024 * 32, "02"),
    bigString03c: "".padEnd(1024 * 32, "03"),
    bigString04c: "".padEnd(1024 * 32, "04"),
    bigString05c: "".padEnd(1024 * 32, "05"),
    bigString06c: "".padEnd(1024 * 32, "06"),
    bigString07c: "".padEnd(1024 * 32, "07"),
    bigString08c: "".padEnd(1024 * 32, "08"),
    bigString09c: "".padEnd(1024 * 32, "09"),
    bigString10c: "".padEnd(1024 * 32, "10"),
    bigString11c: "".padEnd(1024 * 32, "11"),
    bigString12c: "".padEnd(1024 * 32, "12"),
    bigString13c: "".padEnd(1024 * 32, "13"),
    bigString14c: "".padEnd(1024 * 32, "14"),
    bigString15c: "".padEnd(1024 * 32, "15"),
    bigString16c: "".padEnd(1024 * 32, "16"),
    bigString01d: "".padEnd(1024 * 32, "01"),
    bigString02d: "".padEnd(1024 * 32, "02"),
    bigString03d: "".padEnd(1024 * 32, "03"),
    bigString04d: "".padEnd(1024 * 32, "04"),
    bigString05d: "".padEnd(1024 * 32, "05"),
    bigString06d: "".padEnd(1024 * 32, "06"),
    bigString07d: "".padEnd(1024 * 32, "07"),
    bigString08d: "".padEnd(1024 * 32, "08"),
    bigString09d: "".padEnd(1024 * 32, "09"),
    bigString10d: "".padEnd(1024 * 32, "10"),
    bigString11d: "".padEnd(1024 * 32, "11"),
    bigString12d: "".padEnd(1024 * 32, "12"),
    bigString13d: "".padEnd(1024 * 32, "13"),
    bigString14d: "".padEnd(1024 * 32, "14"),
    bigString15d: "".padEnd(1024 * 32, "15"),
    bigString16d: "".padEnd(1024 * 32, "16"),
    bigString01aa: "".padEnd(1024 * 32, "01"),
    bigString02aa: "".padEnd(1024 * 32, "02"),
    bigString03aa: "".padEnd(1024 * 32, "03"),
    bigString04aa: "".padEnd(1024 * 32, "04"),
    bigString05aa: "".padEnd(1024 * 32, "05"),
    bigString06aa: "".padEnd(1024 * 32, "06"),
    bigString07aa: "".padEnd(1024 * 32, "07"),
    bigString08aa: "".padEnd(1024 * 32, "08"),
    bigString09aa: "".padEnd(1024 * 32, "09"),
    bigString10aa: "".padEnd(1024 * 32, "10"),
    bigString11aa: "".padEnd(1024 * 32, "11"),
    bigString12aa: "".padEnd(1024 * 32, "12"),
    bigString13aa: "".padEnd(1024 * 32, "13"),
    bigString14aa: "".padEnd(1024 * 32, "14"),
    bigString15aa: "".padEnd(1024 * 32, "15"),
    bigString16aa: "".padEnd(1024 * 32, "16"),
    bigString01ba: "".padEnd(1024 * 32, "01"),
    bigString02ba: "".padEnd(1024 * 32, "02"),
    bigString03ba: "".padEnd(1024 * 32, "03"),
    bigString04ba: "".padEnd(1024 * 32, "04"),
    bigString05ba: "".padEnd(1024 * 32, "05"),
    bigString06ba: "".padEnd(1024 * 32, "06"),
    bigString07ba: "".padEnd(1024 * 32, "07"),
    bigString08ba: "".padEnd(1024 * 32, "08"),
    bigString09ba: "".padEnd(1024 * 32, "09"),
    bigString10ba: "".padEnd(1024 * 32, "10"),
    bigString11ba: "".padEnd(1024 * 32, "11"),
    bigString12ba: "".padEnd(1024 * 32, "12"),
    bigString13ba: "".padEnd(1024 * 32, "13"),
    bigString14ba: "".padEnd(1024 * 32, "14"),
    bigString15ba: "".padEnd(1024 * 32, "15"),
    bigString16ba: "".padEnd(1024 * 32, "16"),
    bigString01ca: "".padEnd(1024 * 32, "01"),
    bigString02ca: "".padEnd(1024 * 32, "02"),
    bigString03ca: "".padEnd(1024 * 32, "03"),
    bigString04ca: "".padEnd(1024 * 32, "04"),
    bigString05ca: "".padEnd(1024 * 32, "05"),
    bigString06ca: "".padEnd(1024 * 32, "06"),
    bigString07ca: "".padEnd(1024 * 32, "07"),
    bigString08ca: "".padEnd(1024 * 32, "08"),
    bigString09ca: "".padEnd(1024 * 32, "09"),
    bigString10ca: "".padEnd(1024 * 32, "10"),
    bigString11ca: "".padEnd(1024 * 32, "11"),
    bigString12ca: "".padEnd(1024 * 32, "12"),
    bigString13ca: "".padEnd(1024 * 32, "13"),
    bigString14ca: "".padEnd(1024 * 32, "14"),
    bigString15ca: "".padEnd(1024 * 32, "15"),
    bigString16ca: "".padEnd(1024 * 32, "16"),
    bigString01da: "".padEnd(1024 * 32, "01"),
    bigString02da: "".padEnd(1024 * 32, "02"),
    bigString03da: "".padEnd(1024 * 32, "03"),
    bigString04da: "".padEnd(1024 * 32, "04"),
    bigString05da: "".padEnd(1024 * 32, "05"),
    bigString06da: "".padEnd(1024 * 32, "06"),
    bigString07da: "".padEnd(1024 * 32, "07"),
    bigString08da: "".padEnd(1024 * 32, "08"),
    bigString09da: "".padEnd(1024 * 32, "09"),
    bigString10da: "".padEnd(1024 * 32, "10"),
    bigString11da: "".padEnd(1024 * 32, "11"),
    bigString12da: "".padEnd(1024 * 32, "12"),
    bigString13da: "".padEnd(1024 * 32, "13"),
    bigString14da: "".padEnd(1024 * 32, "14"),
    bigString15da: "".padEnd(1024 * 32, "15"),
    bigString16da: "".padEnd(1024 * 32, "16")
  };
  constructor() {
    super();
  }

  createLargeEntityForTest(partitionKey: string): LargeTableTestEntity {
    const initial = this.Create(partitionKey, getUniqueName("row"), "value1");
    return { ...initial, ...this.largeEntityProps };
  }
}

export interface LargeTableTestEntity extends TableTestEntity {
  bigString01a: string;
}
