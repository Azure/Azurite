import { randomUUID } from "crypto";

import BlobStorageContext from "../context/BlobStorageContext";
import Context from "../generated/Context";
import { BlobEventType, IBlobEvent, IBlobEventProps } from "./IBlobEvent";

// Synthetic emulator resource identifiers (real Azure uses ARM resource ids).
const DEV_SUBSCRIPTION_ID = "00000000-0000-0000-0000-000000000000";
const DEV_RESOURCE_GROUP = "azurite";

// Process-level monotonic sequencer. Not per-blob like Azure, but adequate
// for an emulator; vary by index so ordering is observable.
let sequencerCounter = 0;
function nextSequencer(): string {
  sequencerCounter += 1;
  return sequencerCounter.toString(16).padStart(64, "0");
}

function isContainerEvent(eventType: BlobEventType): boolean {
  return (
    eventType === BlobEventType.ContainerCreated ||
    eventType === BlobEventType.ContainerDeleted
  );
}

/**
 * Drop the query string from a request URL before it is persisted. A SAS
 * request carries its credential in the query (e.g. `?...&sig=...`); writing
 * that verbatim into an event file on disk would leak a signing secret. Real
 * Azure Storage events also expose only the bare blob URL in `data.url`, so
 * stripping the query is both safer and more faithful to the Event Grid schema.
 */
function stripQuery(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

/**
 * Build an Azure Event Grid–shaped event from the request context and the
 * operation-specific properties supplied by the handler. Pure: no I/O.
 */
export function createBlobEvent(
  context: Context,
  eventType: BlobEventType,
  api: string,
  props: IBlobEventProps
): IBlobEvent {
  const blobCtx = new BlobStorageContext(context);
  const account = blobCtx.account ?? "";
  const container = blobCtx.container ?? "";
  const blob = blobCtx.blob ?? "";
  const requestId = blobCtx.contextId ?? "";
  const clientRequestId = context.request?.getHeader("x-ms-client-request-id");
  const url = stripQuery(context.request?.getUrl() ?? "");

  const subject = isContainerEvent(eventType)
    ? `/blobServices/default/containers/${container}`
    : `/blobServices/default/containers/${container}/blobs/${blob}`;

  return {
    topic: `/subscriptions/${DEV_SUBSCRIPTION_ID}/resourceGroups/${DEV_RESOURCE_GROUP}/providers/Microsoft.Storage/storageAccounts/${account}`,
    subject,
    eventType,
    id: randomUUID(),
    eventTime: new Date().toISOString(),
    dataVersion: "",
    metadataVersion: "1",
    data: {
      api,
      clientRequestId,
      requestId,
      eTag: props.eTag,
      contentType: props.contentType,
      contentLength: props.contentLength,
      blobType: props.blobType,
      url,
      sequencer: nextSequencer(),
      storageDiagnostics: { batchId: requestId }
    }
  };
}
