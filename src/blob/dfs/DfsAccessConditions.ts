import { Request } from "express";

import * as Models from "../generated/artifacts/models";

/**
 * Extract the lease access conditions (x-ms-lease-id) of a DFS request.
 */
export function extractLeaseConditions(
  req: Request
): Models.LeaseAccessConditions | undefined {
  const leaseId = req.headers["x-ms-lease-id"] as string | undefined;
  if (leaseId) {
    return { leaseId };
  }
  return undefined;
}

/**
 * Extract the modified access conditions (If-Match, If-None-Match,
 * If-Modified-Since, If-Unmodified-Since) of a DFS request.
 */
export function extractModifiedAccessConditions(
  req: Request
): Models.ModifiedAccessConditions | undefined {
  return extractConditions(req, "");
}

/**
 * Extract the modified access conditions of the source of a rename
 * (x-ms-source-if-match, x-ms-source-if-none-match,
 * x-ms-source-if-modified-since, x-ms-source-if-unmodified-since).
 */
export function extractSourceModifiedAccessConditions(
  req: Request
): Models.ModifiedAccessConditions | undefined {
  return extractConditions(req, "x-ms-source-");
}

function extractConditions(
  req: Request,
  prefix: string
): Models.ModifiedAccessConditions | undefined {
  const ifMatch = req.headers[`${prefix}if-match`] as string | undefined;
  const ifNoneMatch = req.headers[`${prefix}if-none-match`] as string | undefined;
  const ifModifiedSince = req.headers[`${prefix}if-modified-since`] as string | undefined;
  const ifUnmodifiedSince = req.headers[`${prefix}if-unmodified-since`] as string | undefined;

  if (!ifMatch && !ifNoneMatch && !ifModifiedSince && !ifUnmodifiedSince) {
    return undefined;
  }

  return {
    ifMatch,
    ifNoneMatch,
    ifModifiedSince: ifModifiedSince ? new Date(ifModifiedSince) : undefined,
    ifUnmodifiedSince: ifUnmodifiedSince ? new Date(ifUnmodifiedSince) : undefined
  };
}
