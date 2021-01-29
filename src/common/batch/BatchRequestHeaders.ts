/*  sample list of headers:
    x-ms-version: 2013-08-15
    Accept-Charset: UTF-8
    DataServiceVersion: 3.0;
    MaxDataServiceVersion: 3.0;NetFx
    Content-Type: multipart/mixed; boundary=batch_a1e9d677-b28b-435e-a89e-87e6a768a431
    x-ms-date: Mon, 14 Oct 2013 18:25:49 GMT
    Authorization: SharedKey myaccount:50daR38MtfezvbMdKrGJVN+8sjDSn+AaA=
    Host: 127.0.0.1:10002
    Content-Length: 1323
    Connection: Keep-Alive
    Content-Type: application/http
    Content-Transfer-Encoding: binary
    Accept: application/json;odata=minimalmetadata
    Prefer: return-no-content
    DataServiceVersion: 3.0;
*/
// using default type of string for the headers
// maybe there is a better way of doing this here which we can
// implement another time
// this is a basic collection type impl.
export default class BatchRequestHeaders {
  public constructor(headers: string[]) {
    this.rawHeaders = headers;
    this.createDictFromRawHeaders();
  }
  private rawHeaders: string[];
  private headerItems: { [index: string]: string } = {};
  private headerCount: number = 0;

  // ToDo: might not be safe but this is an emulator and
  // not a production service
  public getRawHeaders() {
    return this.rawHeaders;
  }

  public containsHeader(key: string): boolean {
    return this.headerItems.hasOwnProperty(key);
  }

  public count(): number {
    return this.headerCount;
  }

  public add(key: string, value: string) {
    if (!this.headerItems.hasOwnProperty(key)) this.headerCount++;

    this.headerItems[key] = value;
  }

  public remove(key: string): string {
    const val = this.headerItems[key];
    delete this.headerItems[key];
    this.headerCount--;
    return val;
  }

  // ToDo: Should this maybe be case insensitive?
  public header(key: string): string {
    return this.headerItems[key];
  }

  public headerKeys(): string[] {
    const headers: string[] = [];

    for (const prop in this.headerItems) {
      if (this.headerItems.hasOwnProperty(prop)) {
        headers.push(prop);
      }
    }

    return headers;
  }

  public headerValues(): string[] {
    const values: string[] = [];

    for (const prop in this.headerItems) {
      if (this.headerItems.hasOwnProperty(prop)) {
        values.push(this.headerItems[prop]);
      }
    }

    return values;
  }

  private createDictFromRawHeaders(): void {
    this.rawHeaders.forEach((rawheader) => {
      if (rawheader != null) {
        const headerKeyMatch = rawheader.match(/^(\S+):/);
        const headerValueMatch = rawheader.match(/(\S+)$/);
        if (headerKeyMatch == null && rawheader.length > 2) {
          this.add(rawheader, "");
        } else if (headerValueMatch != null && headerKeyMatch != null) {
          this.add(headerKeyMatch[1], headerValueMatch[0]);
        } else if (headerKeyMatch != null) {
          this.add(headerKeyMatch[1], "");
        }
      }
    });
  }
}
