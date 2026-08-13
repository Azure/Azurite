import { BlobPrefixModel } from "./IBlobMetadataStore";

/**
 * The sort key of an item on a page: the blob name, plus a secondary key that
 * distinguishes items sharing that name.
 *
 * A blob name alone is not enough to resume a listing once versions are involved,
 * because every version of a blob shares its name. The secondary key is the version ID
 * when listing versions, and empty otherwise.
 */
export type PageItemKey = [string, string];

/**
 * Marker prefix identifying a continuation token that carries a secondary key.
 *
 * Continuation tokens are opaque to clients, but Azurite has always used the plain blob
 * name, so tokens without a secondary key keep that form. That keeps listings which do
 * not involve versions byte for byte unchanged, and keeps tokens issued by older Azurite
 * versions readable.
 */
const COMPOSITE_MARKER_PREFIX = "2!";

/**
 * A continuation token decoded back into its parts.
 */
export interface IDecodedPageMarker {
  name: string;
  secondaryKey: string;
  /**
   * True when the token carried a secondary key. When false the token addresses a whole
   * blob name and every item sharing that name has already been returned.
   */
  isComposite: boolean;
}

/**
 * Encode a page key into a continuation token.
 */
export function encodePageMarker(key: PageItemKey): string {
  const [name, secondaryKey] = key;
  if (secondaryKey === "") {
    return name;
  }
  return (
    COMPOSITE_MARKER_PREFIX +
    Buffer.from(JSON.stringify([name, secondaryKey]), "utf8").toString("base64")
  );
}

/**
 * Decode a continuation token supplied by a client.
 *
 * Anything that is not recognizable as a composite token is treated as a plain blob
 * name, which is both the historical Azurite format and the safe interpretation of a
 * token we did not issue.
 */
export function decodePageMarker(marker: string): IDecodedPageMarker {
  if (!marker.startsWith(COMPOSITE_MARKER_PREFIX)) {
    return { name: marker, secondaryKey: "", isComposite: false };
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(
        marker.slice(COMPOSITE_MARKER_PREFIX.length),
        "base64"
      ).toString("utf8")
    );
    if (
      Array.isArray(decoded) &&
      decoded.length === 2 &&
      typeof decoded[0] === "string" &&
      typeof decoded[1] === "string"
    ) {
      return {
        name: decoded[0],
        secondaryKey: decoded[1],
        isComposite: true
      };
    }
  } catch {
    // Fall through and treat the token as a plain blob name
  }

  return { name: marker, secondaryKey: "", isComposite: false };
}

/**
 * Whether an item with the given key sorts after a decoded continuation token, and so
 * belongs on a later page.
 */
export function isAfterPageMarker(
  key: PageItemKey,
  marker: IDecodedPageMarker
): boolean {
  const [name, secondaryKey] = key;
  if (name > marker.name) {
    return true;
  }
  if (name < marker.name) {
    return false;
  }
  // Same blob name. A plain token means the whole name was already returned; a composite
  // token means we stopped part way through it.
  return marker.isComposite ? secondaryKey > marker.secondaryKey : false;
}

/**
 * This implements a page of blob results taking delimiters into account.
 *
 * When a delimiter is passed to list blobs, items must be squashed into BlobPrefix items.
 * When maxResults is smaller than the number of prefixed items in the metadata source, multiple reads from
 * the source may be necessary.
 *
 * @export
 * @class PageWithDelimiter
 */
export default class PageWithDelimiter<BlobType> {
  readonly delimiter: string | undefined;
  readonly maxResults: number;
  readonly prefix: string | undefined;
  readonly prefixLength: number = 0;

  blobItems: BlobType[] = [];
  blobPrefixes: Set<string> = new Set<string>();
  latestMarker: PageItemKey = ["", ""];

  // isFull indicates we could only (maybe) add a prefix
  private isFull: boolean = false;

  // isExhausted indicates nothing more should be added
  private isExhausted: boolean = false;

  constructor(maxResults: number, delimiter?: string, prefix?: string) {
    this.maxResults = maxResults;
    if (delimiter !== undefined) {
      this.delimiter = delimiter;
    }
    if (prefix !== undefined) {
      this.prefix = prefix;
      this.prefixLength = prefix.length;
    }
  }

  /**
   * Empty the page (useful in unit tests)
   *
   */
  public reset() {
    this.blobItems.splice(0);
    this.blobPrefixes.clear();
    this.isFull = false;
    this.isExhausted = false;
    this.latestMarker = ["", ""];
  }

  private updateFull() {
    this.isFull = (this.blobItems.length + this.blobPrefixes.size === this.maxResults);
  }

  /**
   * addItem will add to the blob list if possible and update the full/exhausted state of the page
   */
  private addItem(item: BlobType): boolean {
    if (this.isExhausted) {
      return false;
    }
    let added: boolean = false;
    if (! this.isFull) {
      this.blobItems.push(item);
      added = true;
    }
    this.updateFull();

    // if a blob causes fullness the next item read cannot be squashed only duplicate prefixes can
    this.isExhausted = this.isFull;
    return added;
  }

  /**
   * addItem will add to the blob list if possible and update the full/exhausted state of the page
   */
  private addPrefix(prefix: string): boolean {
    if (this.isExhausted) {
      return false;
    }
    let added: boolean = false;
    if (this.isFull) {
      // the page is exhausted if this prefix is new, only matching prefixes may be 'added'
      this.isExhausted = ! this.blobPrefixes.has(prefix);
      added = ! this.isExhausted;
    } else {
      this.blobPrefixes.add(prefix);
      added = true;
    }
    this.updateFull();
    return added;
  }

  /**
   * Add a BlobType item to the appropriate collection, update the marker
   *
   * If no delimiter is used, items are all treated as blobs until maxResults is reached
   *
   * If a delimiter is used, the name will be checked for to see if the item should
   * be treated as a blob or a BlobPrefix.
   *
   * When the page becomes full, items may still be added iff the item is existing prefix
   *
   * Return the number of items added
   */
  private add(key: PageItemKey, item: BlobType): boolean {
    if (this.isExhausted) {
      return false;
    }
    const [name, secondaryKey] = key;
    if (name < this.latestMarker[0]) {
      throw new Error("add received unsorted item. add must be called on sorted data");
    }
    // Items sharing a name are not required to carry a secondary key - snapshots, for
    // example, do not - so equal keys are tolerated and simply do not advance the marker.
    const marker: PageItemKey =
      name > this.latestMarker[0] ||
      (name === this.latestMarker[0] && secondaryKey > this.latestMarker[1])
        ? [name, secondaryKey]
        : this.latestMarker;
    let added: boolean = false;
    if (this.delimiter !== undefined) {
      const delimiterPosAfterPrefix = name.indexOf(
        this.delimiter,
        this.prefixLength
      );

      if (delimiterPosAfterPrefix < 0) {
        added = this.addItem(item);
      } else {
        const prefix = name.substr(0, delimiterPosAfterPrefix + 1);
        added = this.addPrefix(prefix);
      }
    } else {
      added = this.addItem(item);
    }
    if (added) {
      this.latestMarker = marker;
    }
    return added;
  }

  /**
   * Iterate over an array blobs read from a source and add them until the page cannot accept new items
   */
  private processList(
    docs: BlobType[],
    nameFn: (item: BlobType) => string | PageItemKey
  ): number {
    let added: number = 0;
    for (const item of docs) {
      const named = nameFn(item);
      const key: PageItemKey =
        typeof named === "string" ? [named, ""] : named;
      if (this.add(key, item)) {
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
    reader: (offset: number) => Promise<BlobType[]>,
    namer: (item: BlobType) => string | PageItemKey,
  ): Promise<[BlobType[], BlobPrefixModel[], string]> {
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
      this.blobItems,
      this.prefixes(),
      added < docs.length ? encodePageMarker(this.latestMarker) : ""
    ];
  }

  private prefixes(): BlobPrefixModel[] {
    const prefixes: BlobPrefixModel[] = [];
    const iter = this.blobPrefixes.values();
    let val;
    while (!(val = iter.next()).done) {
      prefixes.push({ name: val.value });
    }
    return prefixes
  }
}
