import rimraf = require("rimraf");
import { promisify } from "util";

// LokiFsStructuredAdapter
// tslint:disable-next-line:no-var-requires
export const lfsa = require("lokijs/src/loki-fs-structured-adapter.js");

export const rimrafAsync = promisify(rimraf);

export function minDate(date1: Date, date2: Date): Date {
  return date1 > date2 ? date2 : date1;
}

// Blob Snapshot is has 7 digital for Milliseconds, but Datatime has Milliseconds with 3 digital. So need convert.
export function convertDateTimeStringMsTo7Digital(
  dateTimeString: string
): string {
  return dateTimeString.replace("Z", "0000Z");
}

export function convertRawHeadersToMetadata(
  rawHeaders: string[] = []
): { [propertyName: string]: string } | undefined {
  const metadataPrefix = "x-ms-meta-";
  const res: { [propertyName: string]: string } = {};
  let isEmpty = true;

  for (let i = 0; i < rawHeaders.length; i = i + 2) {
    const header = rawHeaders[i];
    if (
      header.toLowerCase().startsWith(metadataPrefix) &&
      header.length > metadataPrefix.length
    ) {
      const key = header.substr(metadataPrefix.length);
      let value = rawHeaders[i + 1] || "";
      if (res[key] !== undefined) {
        value = `${res[key]},${value}`;
      }
      res[key] = value;
      isEmpty = false;
      continue;
    }
  }

  return isEmpty ? undefined : res;
}
