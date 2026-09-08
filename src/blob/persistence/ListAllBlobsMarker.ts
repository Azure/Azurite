export type ListAllBlobsMarker = [name: string, recordId: number];

export function encodeListAllBlobsMarker(marker: ListAllBlobsMarker): string {
  return JSON.stringify(marker);
}

export function decodeListAllBlobsMarker(marker?: string): ListAllBlobsMarker {
  if (marker === undefined || marker === "") {
    return ["", -1];
  }

  try {
    const parsed = JSON.parse(marker);
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "string" &&
      typeof parsed[1] === "number"
    ) {
      return [parsed[0], parsed[1]];
    }
  } catch {
    // Fall through to support name-only markers from older callers.
  }

  return [marker, Number.MAX_SAFE_INTEGER];
}
