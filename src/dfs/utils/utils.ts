import { createHmac } from "crypto";

import StorageErrorFactory from "../errors/StorageErrorFactory";
import Operation from "../generated/artifacts/operation";
import Context from "../../blob/generated/Context";
import { USERDELEGATIONKEY_BASIC_KEY } from "./constants";
import IRequest from "../../blob/generated/IRequest";

export function checkApiVersion(
  inputApiVersion: string,
  validApiVersions: Array<string>,
  context: Context
): void {
  if (!validApiVersions.includes(inputApiVersion)) {
    throw StorageErrorFactory.getInvalidAPIVersion(context, inputApiVersion);
  }
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
    DATA_LAKE_OPERATIONS.includes(context.context.dfsOperation!) ||
    (COMMON_OPERATIONS.includes(context.context.dfsOperation!) &&
      accept !== undefined &&
      accept.includes("json"))
  );
}

export function removeSlash(path: string): string {
  if (!path.endsWith("/")) return path;

  return path.substring(0, path.length - 1);
}
