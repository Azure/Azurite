/**
 * A list blobs continuation token.
 *
 * Azure Storage treats continuation tokens as opaque, so the token is a
 * base64url encoded, versioned JSON document rather than something a caller
 * can construct or interpret. The `v` discriminator lets future versions of
 * Azurite change the payload without ambiguity.
 *
 * The three payload fields form the tuple which listing must use consistently
 * for sorting records, filtering records after the marker, and creating the
 * next marker. `recordId` is the store's stable per-record identity
 * (`$loki` for LokiJS, `blobId` for SQL) and is what makes paging
 * deterministic when several records share a blob name and a timestamp.
 */
export interface BlobListMarkerV1 {
  v: 1;
  name: string;
  timestamp: string;
  recordId: number;
}

/**
 * The ordering tuple a marker represents: [name, timestamp, recordId].
 */
export type BlobListMarkerTuple = [string, string, number];

/**
 * The tuple which sorts before every record, used when no marker was supplied.
 */
export const EMPTY_MARKER_TUPLE: BlobListMarkerTuple = ["", "", -1];

/**
 * A timestamp which sorts after any timestamp Azurite generates.
 *
 * Markers issued by older versions of Azurite were the plain blob name and
 * meant "every record with this name has been returned". Decoding such a
 * marker to this sentinel preserves that exclusive-by-name behaviour.
 */
export const LEGACY_MARKER_TIMESTAMP = "\uffff";

/**
 * The `recordId` carried by a legacy marker.
 *
 * Record ids are store-assigned auto-increment identities and are therefore
 * never negative, so a negative value cannot collide with a real record. The
 * value is never actually compared: {@link LEGACY_MARKER_TIMESTAMP} sorts
 * after any timestamp Azurite generates, so a legacy marker is already decided
 * on the timestamp field before the record id is reached.
 */
export const LEGACY_MARKER_RECORD_ID = -1;

/**
 * Returns true when the marker came from a legacy plain blob name rather than
 * from {@link encodeBlobListMarker}.
 */
export function isLegacyBlobListMarker(marker: BlobListMarkerV1): boolean {
  return (
    marker.timestamp === LEGACY_MARKER_TIMESTAMP &&
    marker.recordId === LEGACY_MARKER_RECORD_ID
  );
}

/**
 * Encode an opaque continuation token for the given ordering tuple.
 */
export function encodeBlobListMarker(
  name: string,
  timestamp: string,
  recordId: number
): string {
  const payload: BlobListMarkerV1 = { v: 1, name, timestamp, recordId };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * Decode a continuation token.
 *
 * An empty or missing token means "start from the beginning". Anything which
 * is not a token produced by {@link encodeBlobListMarker} is treated as a
 * legacy plain blob name, so tokens issued by older versions of Azurite (and
 * callers passing a bare blob name) keep working.
 */
export function decodeBlobListMarker(marker?: string): BlobListMarkerV1 {
  if (marker === undefined || marker === "") {
    return { v: 1, name: "", timestamp: "", recordId: -1 };
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(marker, "base64url").toString("utf8")
    );
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      parsed.v === 1 &&
      typeof parsed.name === "string" &&
      typeof parsed.timestamp === "string" &&
      typeof parsed.recordId === "number" &&
      Number.isInteger(parsed.recordId)
    ) {
      return {
        v: 1,
        name: parsed.name,
        timestamp: parsed.timestamp,
        recordId: parsed.recordId
      };
    }
  } catch {
    // Fall through, the token is not one of ours.
  }

  return {
    v: 1,
    name: marker,
    timestamp: LEGACY_MARKER_TIMESTAMP,
    recordId: LEGACY_MARKER_RECORD_ID
  };
}

/**
 * Convert a decoded marker into its ordering tuple.
 */
export function toBlobListMarkerTuple(
  marker: BlobListMarkerV1
): BlobListMarkerTuple {
  return [marker.name, marker.timestamp, marker.recordId];
}

/**
 * Compare two ordering tuples.
 *
 * Returns a negative number when the first tuple sorts before the second, a
 * positive number when it sorts after, and zero when they are the same record.
 */
export function compareBlobListMarkerTuples(
  tuple1: BlobListMarkerTuple,
  tuple2: BlobListMarkerTuple
): number {
  if (tuple1[0] !== tuple2[0]) {
    return tuple1[0] < tuple2[0] ? -1 : 1;
  }
  if (tuple1[1] !== tuple2[1]) {
    return tuple1[1] < tuple2[1] ? -1 : 1;
  }
  if (tuple1[2] !== tuple2[2]) {
    return tuple1[2] < tuple2[2] ? -1 : 1;
  }
  return 0;
}
