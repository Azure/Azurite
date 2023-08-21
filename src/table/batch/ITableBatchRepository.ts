import BatchRequest from "./BatchRequest";
import TableStorageContext from "../context/TableStorageContext";
import ITableMetadataStore from "../persistence/ITableMetadataStore";

export interface ITableBatchRepository {
  addBatchRequest(request: BatchRequest): void;
  addBatchRequests(requests: BatchRequest[]): void
  getBatchRequests(): BatchRequest[];
  beginBatchTransaction(batchId: string, metadataStore: ITableMetadataStore): Promise<void>;
  endBatchTransaction(
    accountName : string,
    tableName : string,
    batchId : string,
    context : TableStorageContext,
    batchSuccess : boolean) : Promise<void>;
}