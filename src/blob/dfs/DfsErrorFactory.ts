import { Response } from "express";

export interface DfsError {
  statusCode: number;
  code: string;
  message: string;
}

export function sendDfsError(res: Response, error: DfsError): void {
  res.status(error.statusCode);
  res.setHeader("x-ms-error-code", error.code);

  // HEAD requests must not include a response body. Sending Content-Type: application/json
  // with an empty body causes Azure SDKs to crash trying to parse JSON from nothing.
  // Use res.req (set by express) to detect HEAD without requiring callers to pass req.
  if (res.req && res.req.method === "HEAD") {
    res.setHeader("Content-Length", "0");
    res.end();
  } else {
    res.json({
      error: { code: error.code, message: error.message }
    });
  }
}

export function filesystemNotFound(filesystem: string): DfsError {
  return {
    statusCode: 404,
    code: "FilesystemNotFound",
    message: `The specified filesystem does not exist. Filesystem: ${filesystem}`
  };
}

export function pathNotFound(path: string): DfsError {
  return {
    statusCode: 404,
    code: "PathNotFound",
    message: `The specified path does not exist. Path: ${path}`
  };
}

export function pathAlreadyExists(path: string): DfsError {
  return {
    statusCode: 409,
    code: "PathAlreadyExists",
    message: `The specified path already exists. Path: ${path}`
  };
}

export function directoryNotEmpty(path: string): DfsError {
  return {
    statusCode: 409,
    code: "DirectoryNotEmpty",
    message: `The recursive query parameter value must be true to delete a non-empty directory. Path: ${path}`
  };
}

export function invalidSourceOrDestination(message: string): DfsError {
  return {
    statusCode: 400,
    code: "InvalidSourceUri",
    message
  };
}

export function invalidFlushPosition(): DfsError {
  return {
    statusCode: 400,
    code: "InvalidFlushPosition",
    message: "The uploaded data is not contiguous or the position query parameter value is not equal to the length of the file after appending the uploaded data."
  };
}

export function conditionNotMet(): DfsError {
  return {
    statusCode: 412,
    code: "ConditionNotMet",
    message: "The condition specified using HTTP conditional header(s) is not met."
  };
}

export function leaseIdMissing(): DfsError {
  return {
    statusCode: 412,
    code: "LeaseIdMissing",
    message: "There is currently a lease on the resource and no lease ID was specified in the request."
  };
}

export function leaseNotPresent(): DfsError {
  return {
    statusCode: 409,
    code: "LeaseNotPresentWithLeaseOperation",
    message: "There is currently no lease on the resource."
  };
}

export function leaseAlreadyPresent(): DfsError {
  return {
    statusCode: 409,
    code: "LeaseAlreadyPresent",
    message: "There is already a lease present."
  };
}

export function leaseIdMismatch(): DfsError {
  return {
    statusCode: 409,
    code: "LeaseIdMismatchWithLeaseOperation",
    message: "The lease ID specified did not match the lease ID for the resource."
  };
}

export function hierarchicalNamespaceNotEnabled(filesystem: string): DfsError {
  return {
    statusCode: 400,
    code: "HierarchicalNamespaceNotEnabled",
    message: `The account associated with the filesystem does not have hierarchical namespace enabled. Filesystem: ${filesystem}`
  };
}

export function internalError(message: string): DfsError {
  return {
    statusCode: 500,
    code: "InternalError",
    message
  };
}
