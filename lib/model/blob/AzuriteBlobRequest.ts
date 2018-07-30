import * as crypto from "crypto";
import url from "url";
import { BlockListType } from "../../core/Constants";
import env from "../../core/env";
import N from "../../core/HttpHeaderNames";
import InternalAzuriteError from "../../core/InternalAzuriteError";
import AzuriteRequest from "./AzuriteRequest";

// const url  from "url"),
//   BlockListType  from "./../../core/Constants").BlockListType,
//   N  from "./../../core/HttpHeaderNames"),
//   env  from "./../../core/env"),
//   InternalAzuriteError  from "./../../core/InternalAzuriteError");

class AzuriteBlobRequest extends AzuriteRequest {
  public static clone(request) {
    const copy = new AzuriteBlobRequest({
      entityType: request.entityType,
      payload: request.payload,
      req: { rawHeaders: [], headers: {}, params: {}, query: {} }
    });

    return { ...copy, ...request };
  }
  public containerName: any;
  public blobName: any;
  public blockId: any;
  public snapshot: boolean;
  public copyId: any;
  public commit: boolean;
  public blockListType: any;
  public snapshotDate?: string;
  public id: any;
  public originId: any;
  public originUri: any;
  public parentId: any;
  public parentUri: any;
  public uri: any;
  constructor(req, entityType?: any, payload?: any) {
    super({
      entityType: entityType || req.headers["x-ms-blob-type"],
      payload,
      req
    });

    this.containerName = req.params.container;
    this.blobName = req.params[0];
    this.blockId = req.query.blockid;
    this.snapshot = false;
    this.copyId = req.query.copyid;

    // Per default, all (block) blobs will be set to committed by EntityGenerator
    this.commit = true;
    this.blockListType = this.query.blocklisttype || BlockListType.COMMITTED;
    if (this.query.snapshot) {
      this.snapshotDate = new Date(this.query.snapshot).toUTCString();
      this.snapshot = true;
      this.id = env.snapshotId(
        this.containerName,
        this.blobName,
        this.snapshotDate
      );
      this.originId = env.blobId(this.containerName, this.blobName);
      this.originUri = env.diskStorageUri(this.originId);
    } else if (this.blockId) {
      this.id = env.blockId(this.containerName, this.blobName, this.blockId);
      this.parentId = env.blobId(this.containerName, this.blobName);
      this.parentUri = env.diskStorageUri(this.parentId);
    } else {
      this.id = env.blobId(this.containerName, this.blobName);
    }
    this.uri = env.diskStorageUri(this.id);
  }

  public calculateContentMd5() {
    if (!this.body) {
      return undefined;
    }
    return crypto
      .createHash("md5")
      .update(this.body)
      .digest("base64");
  }

  public isSnapshot() {
    return this.snapshot;
  }

  public copySourceName() {
    if (this.httpProps[N.COPY_SOURCE] === undefined) {
      throw new InternalAzuriteError(
        "Request: copySourceUrl was called without copy-source header set."
      );
    }
    const match = /devstoreaccount1\/(.*)/.exec(this.httpProps[N.COPY_SOURCE]);
    if (match === null) {
      throw new InternalAzuriteError(
        `Request: x-ms-copy-source was not in the expected format (was "${
          this.httpProps[N.COPY_SOURCE]
        }".`
      );
    }
    const source = match[1];
    const pathname = url.parse(source).pathname;
    const parts = pathname.split("/");
    const containerName = parts[0];
    parts.splice(0, 1);
    const blobName = decodeURIComponent(parts.join("/")); // unicode characters in http headers are encoded!
    const query = url.parse(source).query;
    let date;
    const regex = /snapshot=([^&]*)/;
    const ssMatch = regex.exec(query);
    if (ssMatch !== null) {
      const dateStr = ssMatch[1];
      date = new Date(decodeURIComponent(dateStr)).toUTCString();
    }
    return {
      date,
      sourceBlobName: blobName,
      sourceContainerName: containerName
    };
  }
}

export default AzuriteBlobRequest;
