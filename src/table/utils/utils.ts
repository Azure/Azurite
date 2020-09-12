import StorageErrorFactory from "../errors/StorageErrorFactory";
import { HeaderConstants } from "./constants";

export function checkApiVersion(
  inputApiVersion: string,
  validApiVersions: Array<string>,
  requestId: string
): void {
  if (!validApiVersions.includes(inputApiVersion)) {
    throw StorageErrorFactory.getInvalidHeaderValue(requestId, {
      HeaderName: HeaderConstants.X_MS_VERSION,
      HeaderValue: inputApiVersion
    });
  }
}
