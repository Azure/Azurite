import BatchRequest from "./BatchRequest";
import TableStorageContext from "../context/TableStorageContext";
import ITableMetadataStore from "../persistence/ITableMetadataStore";
import { ITableBatchRepository } from "./ITableBatchRepository"

/**
 * Provides and separates data access logic from batch orchestration.
 *
 * @export
 * @class TableBatchRepository
 * @implements {ITableBatchRepository}
 */
export default class TableBatchRepository implements ITableBatchRepository {
  private requests: BatchRequest[] = [];
  private metadataStore: ITableMetadataStore;

  constructor(metadataStore: ITableMetadataStore) {
    this.metadataStore = metadataStore;
  }

  addBatchRequest(request: BatchRequest): void {
    this.requests.push(request);
  }

  addBatchRequests(requests: BatchRequest[]): void {
    this.requests.push(...requests);
  }

  getBatchRequests(): BatchRequest[] {
    return this.requests;
  }

  beginBatchTransaction(batchId: string): Promise<void> {
    // initialize transaction rollback capability
    return this.metadataStore.beginBatchTransaction(batchId);
  }

  endBatchTransaction(
    accountName : string,
    tableName : string,
    batchId : string,
    context : TableStorageContext,
    batchSuccess : boolean
  ): Promise<void> {
    // commit or rollback transaction
    return this.metadataStore.endBatchTransaction(accountName, tableName, batchId, context, batchSuccess);
  }
}