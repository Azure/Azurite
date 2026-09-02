
/**
 * This implements a page of blob results.
 * When maxResults is smaller than the number of prefixed items in the metadata source, multiple reads from
 * the source may be necessary.
 *
 * @export
 * @class FilterBlobPage
 */
export default class FilterBlobPage<FilterBlobType> {
  readonly maxResults: number;

  filterBlobItems: FilterBlobType[] = [];
  latestMarker: string = "";

  // isFull indicates we could only (maybe) add a prefix
  private isFull: boolean = false;

  // isExhausted indicates nothing more should be added
  private isExhausted: boolean = false;

  constructor(maxResults: number) {
    this.maxResults = maxResults;
  }

  /**
   * Empty the page (useful in unit tests)
   *
   */
  public reset() {
    this.filterBlobItems.splice(0);
    this.isFull = false;
    this.isExhausted = false;
    this.latestMarker = "";
  }

  private updateFull() {
    this.isFull = (this.filterBlobItems.length === this.maxResults);
  }

  /**
   * addItem will add to the blob list if possible and update the full/exhausted state of the page
   */
  private addItem(item: FilterBlobType): boolean {
    if (this.isExhausted) {
      return false;
    }
    let added: boolean = false;
    if (! this.isFull) {
      this.filterBlobItems.push(item);
      added = true;
    }
    this.updateFull();

    // if a blob causes fullness the next item read cannot be squashed only duplicate prefixes can
    this.isExhausted = this.isFull;
    return added;
  }

  /**
   * Add a BlobType item to the appropriate collection, update the marker
   *
   * When the page becomes full, items may still be added iff the item is existing prefix
   *
   * Return the number of items added
   */
  private add(name: string, item: FilterBlobType): boolean {
    if (this.isExhausted) {
      return false;
    }
    if (name < this.latestMarker) {
      throw new Error("add received unsorted item. add must be called on sorted data");
    }
    const marker = (name > this.latestMarker) ? name : this.latestMarker;
    let added: boolean = false;
    added = this.addItem(item);
    if (added) {
      this.latestMarker = marker;
    }
    return added;
  }

  /**
   * Iterate over an array blobs read from a source and add them until the page cannot accept new items
   */
  private processList(docs: FilterBlobType[], nameFn: (item: FilterBlobType) => string): number {
    let added: number = 0;
    for (const item of docs) {
      if (this.add(nameFn(item), item)) {
        added++;
      }
      if (this.isExhausted) break;
    }
    return added;
  }

  /**
   * Fill the page if possible by using the provided reader function.
   *
   * For any BlobType, the name is used with delimiter to treat the item as a blob or
   * a BlobPrefix for the list blobs result.
   *
   * This function will use the reader for BlobType to keep reading from a metadata
   * data source until the source has no more items or the page cannot add any more items.
   *
   * Return the contents of the page, blobs, prefixes, and a continuation token if applicable
   */
  public async fill(
    reader: (offset: number) => Promise<FilterBlobType[]>,
    namer: (item: FilterBlobType) => string,
  ): Promise<[FilterBlobType[], string]> {
    let offset: number = 0;
    let docs = await reader(offset);
    let added: number = 0;
    while (docs.length) {
      added = this.processList(docs, namer);
      offset += added;
      if (added < this.maxResults) {
        break;
      }
      docs = await reader(offset);
    }
    return [
      this.filterBlobItems,
      added < docs.length ? this.latestMarker : ""
    ];
  }
}
