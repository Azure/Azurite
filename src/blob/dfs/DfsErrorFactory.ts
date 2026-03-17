import { Response } from "express";

export interface DfsError {
  statusCode: number;
  code: string;
  message: string;
}

export function sendDfsError(res: Response, error: DfsError): void {
  res.status(error.statusCode).json({
    error: { code: error.code, message: error.message }
  });
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

export function internalError(message: string): DfsError {
  return {
    statusCode: 500,
    code: "InternalError",
    message
  };
}
