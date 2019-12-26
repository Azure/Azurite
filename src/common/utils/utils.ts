import rimraf = require("rimraf");
import { promisify } from "util";
import StorageErrorFactory from "../../blob/errors/StorageErrorFactory";

// LokiFsStructuredAdapter
// tslint:disable-next-line:no-var-requires
export const lfsa = require("lokijs/src/loki-fs-structured-adapter.js");

export const rimrafAsync = promisify(rimraf);

export function minDate(date1: Date, date2: Date): Date {
  return date1 > date2 ? date2 : date1;
}

export function checkApiVersion(
  inputApiVersion: string,
  validApiVersions: Array<string>,
  requestId: string
): void {
  if (!validApiVersions.includes(inputApiVersion)) {
    throw StorageErrorFactory.getInvalidHeaderValue(requestId, {
      HeaderName: "x-ms-version",
      HeaderValue: inputApiVersion
    });
  }
}

// Blob Snapshot is has 7 digital for Milliseconds, but Datatime has Milliseconds with 3 digital. So need convert.
export function convertDateTimeStringMsTo7Digital(
  dateTimeString: string
): string {
  return dateTimeString.replace("Z", "0000Z");
}
