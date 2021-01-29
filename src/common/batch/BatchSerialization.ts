import { exception } from "console";
import { StorageError } from "../../blob/generated/artifacts/mappers";

export class BatchSerialization {
  public batchBoundary: string = "";
  public changesetBoundary: string = "";

  public extractBatchBoundary(batchRequestsString: string): void {
    const batchBoundaryMatch = batchRequestsString.match(
      "(--batch_.+)+(?=\\n)+"
    );
    if (null != batchBoundaryMatch) {
      this.batchBoundary = batchBoundaryMatch[0];
    } else {
      throw exception("no batch boiundary found in request");
    }
  }

  // ToDo: improve RegEx
  public extractChangeSetBoundary(batchRequestsString: string): void {
    let subChangeSetPrefixMatches = batchRequestsString.match(
      "(boundary=)+(changeset_.+)+(?=\\n)+"
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
}
