import BatchOperation, { BatchType } from "../../common/batch/BatchOperation";

export default class TableBatchOperation extends BatchOperation {
  public constructor(_batchType: BatchType, headers: string) {
    super(_batchType, headers);
  }
}
