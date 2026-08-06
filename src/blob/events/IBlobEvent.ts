/**
 * Azure Event Grid event types for Storage blob events.
 * BlobCreated / BlobDeleted match real Azure. Container* are Azurite
 * convention-named (Azure Event Grid has no container-level blob events);
 * the precise operation is always carried in `data.api`.
 */
export enum BlobEventType {
  BlobCreated = "Microsoft.Storage.BlobCreated",
  BlobDeleted = "Microsoft.Storage.BlobDeleted",
  ContainerCreated = "Microsoft.Storage.ContainerCreated",
  ContainerDeleted = "Microsoft.Storage.ContainerDeleted"
}

/** Operation-specific values a handler passes when emitting an event. */
export interface IBlobEventProps {
  eTag?: string;
  contentType?: string;
  contentLength?: number;
  blobType?: string;
}

/** The `data` payload of an Event Grid storage event. */
export interface IBlobEventData {
  api: string;
  clientRequestId?: string;
  requestId: string;
  eTag?: string;
  contentType?: string;
  contentLength?: number;
  blobType?: string;
  url: string;
  sequencer: string;
  storageDiagnostics: { batchId: string };
}

/** The Event Grid event envelope written to a JSON file. */
export interface IBlobEvent {
  topic: string;
  subject: string;
  eventType: BlobEventType;
  id: string;
  eventTime: string;
  dataVersion: string;
  metadataVersion: string;
  data: IBlobEventData;
}
