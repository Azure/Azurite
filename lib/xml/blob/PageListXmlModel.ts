import * as os from "os";

/*
 * The serialization model for GET PageRanges.
 * Note that we are not using xml2js since the XML-schema needed when supporting snapshotting cannot
 * be implemented with it.
 * See https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/get-page-ranges for details on the schema.
 */
class PageListXmlModel {
  public items: any[];
  constructor() {
    this.items = [];
  }

  public addPageRange(startByte, endByte) {
    this.items.push(new PageRange(startByte, endByte));
  }

  public addClearRange(startByte, endByte) {
    this.items.push(new ClearRange(startByte, endByte));
  }

  public toString() {
    let out = `<?xml version="1.0" encoding="utf-8"?>` + os.EOL;
    out += "<PageList>" + os.EOL;
    for (const item of this.items) {
      out +=
        item instanceof PageRange
          ? "<PageRange>" + os.EOL
          : "<ClearRange>" + os.EOL;
      out += `<Start>${item.start}</Start>` + os.EOL;
      out += `<End>${item.end}</End>` + os.EOL;
      out +=
        item instanceof PageRange
          ? "</PageRange>" + os.EOL
          : "</ClearRange>" + os.EOL;
    }
    out += "</PageList>";
    return out;
  }
}

class PageRange {
  public start: any;
  public end: any;
  constructor(startByte, endByte) {
    this.start = startByte;
    this.end = endByte;
  }
}

class ClearRange {
  public start: any;
  public end: any;
  constructor(startByte, endByte) {
    this.start = startByte;
    this.end = endByte;
  }
}

export default PageListXmlModel;
