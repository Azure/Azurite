import { PageRange } from "../generated/artifacts/models";
import { PersistencyPageRange } from "../persistence/IBlobMetadataStore";

export default interface IPageBlobRangesManager {
  mergeRange(ranges: PersistencyPageRange[], range: PersistencyPageRange): void;

  clearRange(ranges: PersistencyPageRange[], range: PageRange): void;

  cutRanges(
    ranges: PersistencyPageRange[],
    range: PageRange
  ): PersistencyPageRange[];

  fillZeroRanges(
    ranges: PersistencyPageRange[],
    range: PageRange
  ): PersistencyPageRange[];
}
