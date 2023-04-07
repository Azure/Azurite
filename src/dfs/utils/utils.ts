import { createHmac } from "crypto";
import { createWriteStream, PathLike } from "fs";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import { USERDELEGATIONKEY_BASIC_KEY } from "./constants";
import Context from "../generated/Context";
import Operation from "../generated/artifacts/operation";
import IRequest from "../generated/IRequest";
import os from "os";
import { execSync, ExecSyncOptionsWithStringEncoding } from "child_process";

export function checkApiVersion(
  inputApiVersion: string,
  validApiVersions: Array<string>,
  context: Context
): void {
  if (!validApiVersions.includes(inputApiVersion)) {
    throw StorageErrorFactory.getInvalidAPIVersion(context, inputApiVersion);
  }
}

export async function streamToLocalFile(
  stream: NodeJS.ReadableStream,
  path: PathLike
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const writeStream = createWriteStream(path);
    stream
      .on("error", reject)
      // .on("end", resolve)
      .pipe(writeStream)
      .on("close", resolve)
      .on("error", reject);
  });
}

/**
 * Default range value [0, Infinite] will be returned if all parameters not provided.
 *
 * @export
 * @param {string} [rangeHeaderValue]
 * @param {string} [xMsRangeHeaderValue]
 * @returns {[number, number]}
 */
export function deserializeRangeHeader(
  rangeHeaderValue?: string,
  xMsRangeHeaderValue?: string
): [number, number] {
  const range = xMsRangeHeaderValue || rangeHeaderValue;
  if (!range) {
    return [0, Infinity];
  }

  let parts = range.split("=");
  if (parts === undefined || parts.length !== 2) {
    throw new RangeError(
      `deserializeRangeHeader: raw range value ${range} is wrong.`
    );
  }

  parts = parts[1].split("-");
  if (parts === undefined || parts.length < 1 || parts.length > 2) {
    throw new RangeError(
      `deserializeRangeHeader: raw range value ${range} is wrong.`
    );
  }

  const startInclusive = parseInt(parts[0], 10);
  let endInclusive = Infinity;

  if (parts.length > 1 && parts[1] !== "") {
    endInclusive = parseInt(parts[1], 10);
  }

  if (startInclusive > endInclusive) {
    throw new RangeError(
      `deserializeRangeHeader: raw range value ${range} is wrong.`
    );
  }

  return [startInclusive, endInclusive];
}

/**
 * Deserialize range header into valid page ranges.
 * For example, "bytes=0-1023" will return [0, 1023].
 *
 * Default range value [0, Infinite] will be returned if all parameters not provided.
 *
 * @private
 * @param {string} [rangeHeaderValue]
 * @param {string} [xMsRangeHeaderValue]
 * @returns {([number, number] | undefined)}
 */
export function deserializePageBlobRangeHeader(
  rangeHeaderValue?: string,
  xMsRangeHeaderValue?: string,
  force512boundary = true
): [number, number] {
  const ranges = deserializeRangeHeader(rangeHeaderValue, xMsRangeHeaderValue);
  const startInclusive = ranges[0];
  const endInclusive = ranges[1];

  if (force512boundary && startInclusive % 512 !== 0) {
    throw new RangeError(
      `deserializePageBlobRangeHeader: range start value ${startInclusive} doesn't align with 512 boundary.`
    );
  }

  if (
    force512boundary &&
    endInclusive !== Infinity &&
    (endInclusive + 1) % 512 !== 0
  ) {
    throw new RangeError(
      `deserializePageBlobRangeHeader: range end value ${endInclusive} doesn't align with 512 boundary.`
    );
  }

  return [startInclusive, endInclusive];
}

/**
 * Remove double Quotation mark from ListBlob returned Etag, to align with server
 *
 * @param {string} [inputEtag]
 * @returns {string}
 */
export function removeQuotationFromListBlobEtag(inputEtag: string): string {
  if (inputEtag === undefined) {
    return inputEtag;
  }
  if (inputEtag[0] === '"' && inputEtag[inputEtag.length - 1] === '"') {
    return inputEtag.substring(1, inputEtag.length - 1);
  }
  return inputEtag;
}

export function validateContainerName(context: Context, containerName: string) {
  if (
    containerName !== "" &&
    (containerName!.length < 3 || containerName!.length > 63)
  ) {
    throw StorageErrorFactory.getOutOfRangeName(context);
  }
  const reg = new RegExp("^[a-z0-9](?!.*--)[a-z0-9-]{1,61}[a-z0-9]$");
  if (!reg.test(containerName!)) {
    throw StorageErrorFactory.getInvalidResourceName(context);
  }
}

export function getUserDelegationKeyValue(
  signedObjectid: string,
  signedTenantid: string,
  signedStartsOn: string,
  signedExpiresOn: string,
  signedVersion: string
): string {
  const stringToSign = [
    signedObjectid,
    signedTenantid,
    signedStartsOn,
    signedExpiresOn,
    "b",
    signedVersion
  ].join("\n");

  return createHmac("sha256", USERDELEGATIONKEY_BASIC_KEY)
    .update(stringToSign, "utf8")
    .digest("base64");
}

const DATA_LAKE_OPERATIONS = [
  Operation.FileSystem_Create,
  Operation.FileSystem_SetProperties,
  Operation.FileSystem_GetProperties,
  Operation.FileSystem_Delete,
  Operation.FileSystem_ListPaths,
  Operation.Path_Create,
  Operation.Path_Update,
  Operation.Path_Lease,
  Operation.Path_Delete,
  Operation.Path_SetAccessControl,
  Operation.Path_SetAccessControlRecursive,
  Operation.Path_FlushData,
  Operation.Path_AppendData,
  Operation.Path_SetExpiry,
  Operation.Path_Undelete
];

const COMMON_OPERATIONS = [Operation.Path_Read, Operation.Path_GetProperties];

export function isDataLakeOperation(
  context: Context,
  request: IRequest | undefined = context.request
): boolean {
  const accept = request?.getHeader("Accept");
  return (
    DATA_LAKE_OPERATIONS.includes(context.operation!) ||
    (COMMON_OPERATIONS.includes(context.operation!) &&
      accept !== undefined &&
      accept.includes("json"))
  );
}

export function removeSlash(path: string): string {
  if (!path.endsWith("/")) return path;

  return path.substring(0, path.length - 1);
}

export function getUser(): string {
  return os.userInfo().username;
}

export function getGroup(): string {
  if (os.platform() === "win32") return "";
  const options: ExecSyncOptionsWithStringEncoding = {
    encoding: "utf8"
  };
  const output = execSync("id -gn", options);
  if (output) {
    return output.substring(0, output.length - 1); //remove trailing \n
  }

  return "";
}
