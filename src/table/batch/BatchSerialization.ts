import { StorageError } from "../../blob/generated/artifacts/mappers";

/**
 * Base Batch serialization class.
 * Contains shared logic for batch serialization.
 * ToDo: Make these util functions static or aggregate this logic into one of the other
 * batch classes
 *
 * @export
 * @param {string} batchBoundary
 * @param {string} changesetBoundary
 */
export class BatchSerialization {
  public batchBoundary: string = "";
  public changesetBoundary: string = "";
  public lineEnding: string = "";

  public extractBatchBoundary(batchRequestsString: string): void {
    let batchRequestToProcess = "";
    try {
      batchRequestToProcess = decodeURI(batchRequestsString);
    } catch (err: any) {
      batchRequestToProcess = batchRequestsString;
    }
    const batchBoundaryMatch = batchRequestToProcess.match(
      // prettier-ignore
      /--batch_(\w+-?)+/
    );
    if (null != batchBoundaryMatch) {
      this.batchBoundary = batchBoundaryMatch[0];
    } else {
      throw Error("no batch boundary found in request");
    }
  }

  // ToDo: improve RegEx, as not sure if spec allows for use of other
  // change set boundary styles (such as boundary=blahblahblah)
  // have tried to make as generic as possible
  public extractChangeSetBoundary(batchRequestsString: string): void {
    let subChangeSetPrefixMatches = batchRequestsString.match(
      /(boundary=)+(\w+_?(\w+-?)+)/
    );

    if (subChangeSetPrefixMatches != null) {
      this.changesetBoundary = subChangeSetPrefixMatches[2];
    } else {
      // we need to see if this is a single query batch operation
      // whose format is different! (as we only support a single query per batch)
      // ToDo: do we need to check for GET HTTP verb?
      subChangeSetPrefixMatches = batchRequestsString.match(/(--batch_\w+)/);
      if (subChangeSetPrefixMatches != null) {
        this.changesetBoundary = subChangeSetPrefixMatches[1];
      } else {
        throw StorageError;
      }
    }
  }

  public extractLineEndings(batchRequestsString: string): void {
    const lineEndingMatch = batchRequestsString.match(
      // prettier-ignore
      /\r?\n+/
    );
    if (lineEndingMatch != null) {
      this.lineEnding = lineEndingMatch[0];
    } else {
      throw StorageError;
    }
  }

  /**
   * Extracts the path from a URI
   * @param uriString
   * @returns just the path
   */
  public extractPath(uriString: string) {
    return uriString.match(/\/\w+\/(\w+)/);
  }
}
