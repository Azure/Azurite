/**
 * Provides access to headers for batch requests.
 * As requests in an entity group transaction have different headers per
 * transaction, and these need to be handled separately to the
 * outer request envelope.
 *
 * @export
 * @class BatchRequestHeaders
 */
export default class BatchRequestHeaders {
  public constructor(headers: string[]) {
    this.rawHeaders = headers;
    this.createDictFromRawHeaders();
  }
  private rawHeaders: string[];
  private headerItems: { [index: string]: string } = {};
  private headerCount: number = 0;

  /**
   * Returns the raw headers as a string array
   *
   * @return {*}
   * @memberof BatchRequestHeaders
   */
  public getRawHeaders() {
    return this.rawHeaders;
  }

  /**
   * Checks for existence of a header
   *
   * @param {string} key
   * @return {*}  {boolean}
   * @memberof BatchRequestHeaders
   */
  public containsHeader(key: string): boolean {
    return this.headerItems.hasOwnProperty(key);
  }

  /**
   * The count of headers
   *
   * @return {*}  {number}
   * @memberof BatchRequestHeaders
   */
  public count(): number {
    return this.headerCount;
  }

  /**
   * Add a header to the header items
   *
   * @param {string} key
   * @param {string} value
   * @memberof BatchRequestHeaders
   */
  public add(key: string, value: string) {
    if (!this.headerItems.hasOwnProperty(key)) this.headerCount++;

    this.headerItems[key] = value;
  }

  /**
   * Remove a header from the header items
   *
   * @param {string} key
   * @return {*}  {string}
   * @memberof BatchRequestHeaders
   */
  public remove(key: string): string {
    const val = this.headerItems[key];
    delete this.headerItems[key];
    this.headerCount--;
    return val;
  }

  /**
   * Returns the header value based on a lower case lookup of the key
   *
   * @param {string} key
   * @return {*}  {string}
   * @memberof BatchRequestHeaders
   */
  public header(key: string): string {
    return this.headerItems[key.toLocaleLowerCase()];
  }

  /**
   * The header keys as a string array
   *
   * @return {*}  {string[]}
   * @memberof BatchRequestHeaders
   */
  public headerKeys(): string[] {
    const headers: string[] = [];

    for (const prop in this.headerItems) {
      if (this.headerItems.hasOwnProperty(prop)) {
        headers.push(prop);
      }
    }

    return headers;
  }

  /**
   * Header values as a string array
   *
   * @return {*}  {string[]}
   * @memberof BatchRequestHeaders
   */
  public headerValues(): string[] {
    const values: string[] = [];

    for (const prop in this.headerItems) {
      if (this.headerItems.hasOwnProperty(prop)) {
        values.push(this.headerItems[prop]);
      }
    }

    return values;
  }

  /**
   * Creates the dictionary to allow key value lookups on the headers
   *
   * @private
   * @memberof BatchRequestHeaders
   */
  private createDictFromRawHeaders(): void {
    this.rawHeaders.forEach((rawheader) => {
      if (rawheader != null) {
        const headerMatch = rawheader.match(/(\S+)(:\s?)(\S+)/);
        if (headerMatch == null && rawheader.length > 2) {
          this.add(rawheader, "");
        } else if (headerMatch != null) {
          this.add(headerMatch[1].toLocaleLowerCase(), headerMatch[3]);
        }
      }
    });
  }
}
