import { PageRange } from "../generated/artifacts/models";
import {
  PersistencyPageRange,
  ZERO_EXTENT_ID
} from "../persistence/IBlobMetadataStore";
import IPageBlobRangesManager from "./IPageBlobRangesManager";

/********** Ranges Merging Strategy ************/
//
// Example:
// Existing ranges: |---| |------|    |---------|  |-----|
// New range      :          |----------------------|
//
// 4 existing ranges, and one new request range.
// Above 4 existing ranges, 3 existing ranges are get impacted.
//
// We have 2 merging strategies:
// #1 Merge all impacted ranges
//                : |---| |**------------------------****|
// #2 Split first and last impacted existing ranges:
//                : |---| |**|----------------------|****|
//
// Question:
// Every range has a pointer to a chunk in one persistency layer extent.
// When implementing Get Page Ranges Diff request, we will assume 2 (sub)ranges
// are same if they pointing to same range of an extent. (Or we can comparing the
// persistency layer payload, but it's not efficiency.)
//
// For #1 strategy, Get Page Ranges Diff will return a larger range scope than
// the actual changed. Above ranges marked as * will point to new allocated extent,
// while in previous snapshot, they still point to old extent.
// One potential workaround is to update these ranges in snapshot blob to pointing
// to same new allocated extent. But this will make implementation of update ranges
// more complex, and also makes snapshot mutable.
// Another concern is that, the * ranges may have large footprint, which is
// time consuming.
//
// For #2 strategy, there will be more and more small ranges. See the |**| and |****|.
// But it's able . We can make the "merging" work to future GC.
//
// We choose #2 strategy, and leave the merging work to future GC, which will merging
// small ranges in background.
//
// TODO for #2 strategy:
// * Resize API: Should remove additional ranges
// * Download Page Blob API after resize (shift): Should taking resize into consideration
// * Clean Ranges API: Same strategy like update ranges
// * Page Blob GC for Ranges Merger: Merge small ranges and extent chunks for page blob and snapshots
// * GC for un-referred extents
export default class PageBlobRangesManager implements IPageBlobRangesManager {
  public mergeRange(
    ranges: PersistencyPageRange[],
    range: PersistencyPageRange
  ): void {
    const start = range.start; // Inclusive
    const end = range.end; // Inclusive
    const persistency = range.persistency;

    const impactedScope = this.selectImpactedRanges(ranges, start, end);

    // Find out first and last impacted range index
    const impactedStartIndex = impactedScope[0];
    const impactedEndIndex = impactedScope[1];
    const impactedRangesCount =
      impactedStartIndex > impactedEndIndex // No impacted ranges
        ? 0
        : impactedEndIndex - impactedStartIndex + 1;

    // New created range for this request payload
    const newRange: PersistencyPageRange = { start, end, persistency };

    if (impactedRangesCount === 0) {
      // If there is no existing impacted range, just insert the new range
      ranges.splice(impactedStartIndex, 0, newRange);
    } else {
      // Otherwise, try to split the first and last impacted ranges
      const firstImpactedRange = ranges[impactedStartIndex];
      const lastImpactedRange = ranges[impactedEndIndex];

      // Ranges to be inserted
      const newRanges = [];

      // If first range needs to be split, push the split range
      if (firstImpactedRange.end >= start && firstImpactedRange.start < start) {
        newRanges.push({
          start: firstImpactedRange.start,
          end: start - 1,
          persistency: {
            id: firstImpactedRange.persistency.id,
            offset: firstImpactedRange.persistency.offset,
            count: start - firstImpactedRange.start
          }
        });
      }

      newRanges.push(newRange);

      // If last impacted range needs to be split, push the split range
      if (end >= lastImpactedRange.start && end < lastImpactedRange.end) {
        newRanges.push({
          start: end + 1,
          end: lastImpactedRange.end,
          persistency: {
            id: lastImpactedRange.persistency.id,
            offset:
              lastImpactedRange.persistency.offset +
              (end + 1 - lastImpactedRange.start),
            count: lastImpactedRange.end - end
          }
        });
      }

      ranges.splice(impactedStartIndex, impactedRangesCount, ...newRanges);
    }
  }

  public clearRange(ranges: PersistencyPageRange[], range: PageRange): void {
    const start = range.start; // Inclusive
    const end = range.end; // Inclusive

    // Find out existing impacted ranges list
    const impactedScope = this.selectImpactedRanges(ranges, start, end);

    // Find out first and last impacted range index
    const impactedStartIndex = impactedScope[0];
    const impactedEndIndex = impactedScope[1];
    const impactedRangesCount =
      impactedStartIndex > impactedEndIndex // No impacted ranges
        ? 0
        : impactedEndIndex - impactedStartIndex + 1;

    if (impactedRangesCount > 0) {
      // Try to split the first and last impacted ranges
      const firstImpactedRange = ranges[impactedStartIndex];
      const lastImpactedRange = ranges[impactedEndIndex];

      // Ranges to be inserted
      const newRanges = [];

      // If first range needs to be split, push the split range
      if (firstImpactedRange.end >= start && firstImpactedRange.start < start) {
        newRanges.push({
          start: firstImpactedRange.start,
          end: start - 1,
          persistency: {
            id: firstImpactedRange.persistency.id,
            offset: firstImpactedRange.persistency.offset,
            count: start - firstImpactedRange.start
          }
        });
      }

      // If last impacted range needs to be split, push the split range
      if (end >= lastImpactedRange.start && end < lastImpactedRange.end) {
        newRanges.push({
          start: end + 1,
          end: lastImpactedRange.end,
          persistency: {
            id: lastImpactedRange.persistency.id,
            offset:
              lastImpactedRange.persistency.offset +
              (end + 1 - lastImpactedRange.start),
            count: lastImpactedRange.end - end
          }
        });
      }

      ranges.splice(impactedStartIndex, impactedRangesCount, ...newRanges);
    }
  }

  /**
   * This method will not modify values of parameter ranges.
   *
   * @param {PersistencyPageRange[]} ranges
   * @param {PageRange} range
   * @returns {PersistencyPageRange[]}
   * @memberof PageBlobRangesManager
   */
  public cutRanges(
    ranges: PersistencyPageRange[],
    range: PageRange
  ): PersistencyPageRange[] {
    const start = range.start; // Inclusive
    const end = range.end; // Inclusive

    const impactedScope = this.selectImpactedRanges(ranges, start, end);

    // Find out first and last impacted range index
    const impactedStartIndex = impactedScope[0];
    const impactedEndIndex = impactedScope[1];
    const impactedRangesCount =
      impactedStartIndex > impactedEndIndex
        ? 0 // No impacted ranges
        : impactedEndIndex - impactedStartIndex + 1;

    let impactedRanges: PersistencyPageRange[] = [];

    if (impactedRangesCount > 0) {
      impactedRanges = ranges.slice(impactedStartIndex, impactedEndIndex + 1);

      // If first range needs to be split
      const firstImpactedRange = impactedRanges[0];
      if (firstImpactedRange.end >= start && firstImpactedRange.start < start) {
        impactedRanges[0] = {
          start,
          end: firstImpactedRange.end,
          persistency: {
            offset:
              start -
              firstImpactedRange.start +
              firstImpactedRange.persistency.offset,
            count:
              firstImpactedRange.persistency.count -
              (start - firstImpactedRange.start),
            id: firstImpactedRange.persistency.id
          }
        };
      }

      const lastImpactedRange = impactedRanges[impactedRanges.length - 1];
      // If last impacted range needs to be split
      if (end >= lastImpactedRange.start && end < lastImpactedRange.end) {
        impactedRanges[impactedRanges.length - 1] = {
          start: lastImpactedRange.start,
          end,
          persistency: {
            offset: lastImpactedRange.persistency.offset,
            count:
              lastImpactedRange.persistency.count -
              (lastImpactedRange.end - end),
            id: lastImpactedRange.persistency.id
          }
        };
      }
    }

    return impactedRanges;
  }

  public fillZeroRanges(
    ranges: PersistencyPageRange[],
    range: PageRange
  ): PersistencyPageRange[] {
    ranges = this.cutRanges(ranges, range);
    const filledRanges: PersistencyPageRange[] = [];

    if (ranges.length === 0) {
      return [
        {
          start: range.start,
          end: range.end,
          persistency: {
            offset: 0,
            count: range.end + 1 - range.start,
            id: ZERO_EXTENT_ID
          }
        }
      ];
    }

    const firstRange = ranges[0];
    const lastRange = ranges[ranges.length - 1];

    if (range.start < firstRange.start) {
      filledRanges.push({
        start: range.start,
        end: firstRange.start - 1,
        persistency: {
          offset: 0,
          count: firstRange.start - range.start,
          id: ZERO_EXTENT_ID
        }
      });
    }

    // TODO: fill in zero ranges in the middle
    for (let i = 0; i < ranges.length - 1; i++) {
      const nextRange = ranges[i + 1];
      const currentRange = ranges[i];

      filledRanges.push(currentRange);

      const gap = nextRange.start - 1 - currentRange.end;
      if (gap > 0) {
        filledRanges.push({
          start: currentRange.end + 1,
          end: nextRange.start - 1,
          persistency: {
            offset: 0,
            count: gap,
            id: ZERO_EXTENT_ID
          }
        });
      }
    }

    filledRanges.push(ranges[ranges.length - 1]);

    if (lastRange.end < range.end) {
      filledRanges.push({
        start: lastRange.end + 1,
        end: range.end,
        persistency: {
          offset: 0,
          count: range.end - lastRange.end,
          id: ZERO_EXTENT_ID
        }
      });
    }

    return filledRanges;
  }

  /**
   * Select overlapped ranges based on binary search.
   *
   * @public
   * @param {PersistencyPageRange[]} ranges Existing ranges
   * @param {number} start Start offset of the new range, inclusive
   * @param {number} end End offset of the new range, inclusive
   * @returns {[number, number]} Impacted start and end ranges indexes tuple
   *                             When no impacted ranges found, will return indexes
   *                             for 2 closet existing ranges
   *                             [FirstLargerRangeIndex, FirstSmallerRangeIndex]
   * @memberof PageBlobRangesManager
   */
  public selectImpactedRanges(
    ranges: PersistencyPageRange[],
    start: number,
    end: number
  ): [number, number] {
    if (ranges.length === 0) {
      return [Infinity, -1];
    }

    if (start > end || start < 0) {
      throw new RangeError(
        // tslint:disable-next-line:max-line-length
        "PageBlobRangesManager:selectImpactedRanges() start must less equal than end parameter, start must larger equal than 0."
      );
    }

    const impactedRangeStartIndex = this.locateFirstImpactedRange(
      ranges,
      0,
      ranges.length,
      start
    );

    const impactedRangesEndIndex = this.locateLastImpactedRange(
      ranges,
      0,
      ranges.length,
      end
    );

    return [impactedRangeStartIndex, impactedRangesEndIndex];
  }

  /**
   * Locate first impacted range for a given position.
   *
   * @public
   * @param {PersistencyPageRange[]} ranges
   * @param {number} searchStart Index of start range in ranges array, inclusive
   * @param {number} searchEnd Index of end range in ranges array, exclusive
   * @param {number} position First range index covers or larger than position will be returned
   * @returns {number} Index of first impacted range or Infinity for no results
   * @memberof PageBlobHandler
   */
  public locateFirstImpactedRange(
    ranges: PersistencyPageRange[],
    searchStart: number,
    searchEnd: number,
    position: number
  ): number {
    searchStart = searchStart < 0 ? 0 : searchStart;
    searchEnd = searchEnd > ranges.length ? searchEnd : searchEnd;
    if (ranges.length === 0 || searchStart >= searchEnd) {
      return Infinity;
    }

    // Only last element to check
    if (searchStart === searchEnd - 1) {
      return this.positionInRange(ranges[searchStart], position) ||
        position < ranges[searchStart].start
        ? searchStart
        : Infinity;
    }

    // 2 or more elements left
    const searchMid = Math.floor((searchStart + searchEnd) / 2);
    const indexInLeft = this.locateFirstImpactedRange(
      ranges,
      searchStart,
      searchMid,
      position
    );
    if (indexInLeft !== Infinity) {
      return indexInLeft;
    }
    if (
      this.positionInRange(ranges[searchMid], position) ||
      position < ranges[searchMid].start
    ) {
      return searchMid;
    } else {
      return this.locateFirstImpactedRange(
        ranges,
        searchMid + 1, // Remove searchMid range from searching scope
        searchEnd,
        position
      );
    }
  }

  /**
   * Locate last impacted range for a given position.
   *
   * @public
   * @param {PersistencyPageRange[]} ranges
   * @param {number} searchStart Index of start range in ranges array, inclusive
   * @param {number} searchEnd Index of end range in ranges array, exclusive
   * @param {number} position Last range index covers or less than position will be returned
   * @returns {number} Index of first impacted range or -1 for no results
   * @memberof PageBlobHandler
   */
  public locateLastImpactedRange(
    ranges: PersistencyPageRange[],
    searchStart: number,
    searchEnd: number,
    position: number
  ): number {
    searchStart = searchStart < 0 ? 0 : searchStart;
    searchEnd = searchEnd > ranges.length ? searchEnd : searchEnd;
    if (ranges.length === 0 || searchStart >= searchEnd) {
      return -1;
    }

    // Only last element to check
    if (searchStart === searchEnd - 1) {
      return this.positionInRange(ranges[searchStart], position) ||
        position > ranges[searchStart].end
        ? searchStart
        : -1;
    }

    // 2 or more elements left
    const searchMid = Math.floor((searchStart + searchEnd) / 2);
    const indexInRight = this.locateLastImpactedRange(
      ranges,
      searchMid + 1, // Remove searchMid range from searching scope
      searchEnd,
      position
    );
    if (indexInRight > -1) {
      return indexInRight;
    }
    if (
      this.positionInRange(ranges[searchMid], position) ||
      position > ranges[searchMid].end
    ) {
      return searchMid;
    } else {
      return this.locateLastImpactedRange(
        ranges,
        searchStart,
        searchMid,
        position
      );
    }
  }

  public positionInRange(
    range: PersistencyPageRange,
    position: number
  ): boolean {
    return position >= range.start && position <= range.end;
  }
}
