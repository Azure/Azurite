import { truncatedISO8061Date } from "../../common/utils/utils";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import { TableResponseProperties } from "../generated/artifacts/models";
import Context from "../generated/Context";
import {
  Entity,
  IOdataAnnotations,
  IOdataAnnotationsOptional,
  Table
} from "../persistence/ITableMetadataStore";
import {
  FULL_METADATA_ACCEPT,
  HeaderConstants,
  MINIMAL_METADATA_ACCEPT,
  XML_METADATA
} from "./constants";

export function getTableOdataAnnotationsForRequest(
  account: string,
  table: string
): IOdataAnnotations {
  return getOdataAnnotations(account, "", table);
}

export function getTableOdataAnnotationsForResponse(
  account: string,
  table: string,
  urlPrefix: string
): IOdataAnnotations {
  return getOdataAnnotations(account, urlPrefix, table);
}

export function updateTableOdataAnnotationsForResponse(
  table: Table,
  account: string,
  urlPrefix: string,
  accept?: string
): Table {
  const annotation = getTableOdataAnnotationsForResponse(
    account,
    table.table,
    urlPrefix
  );

  if (
    accept &&
    (accept === MINIMAL_METADATA_ACCEPT || accept === FULL_METADATA_ACCEPT)
  ) {
    table.odatametadata = annotation.odatametadata;
  }

  if (accept && accept === FULL_METADATA_ACCEPT) {
    table.odatatype = annotation.odatatype;
    table.odataid = annotation.odataid;
    table.odataeditLink = annotation.odataeditLink;
  }

  return table;
}

export function getTablePropertiesOdataAnnotationsForResponse(
  tableName: string,
  account: string,
  urlPrefix: string,
  accept?: string
): TableResponseProperties {
  const table: TableResponseProperties = {
    tableName
  };

  const annotation = getTableOdataAnnotationsForResponse(
    account,
    tableName,
    urlPrefix
  );

  if (accept && accept === FULL_METADATA_ACCEPT) {
    table.odatatype = annotation.odatatype;
    table.odataid = annotation.odataid;
    table.odataeditLink = annotation.odataeditLink;
  }

  return table;
}

export function updateTableOptionalOdataAnnotationsForResponse(
  tableLike: IOdataAnnotationsOptional,
  account: string,
  table: string,
  urlPrefix: string,
  accept?: string
): IOdataAnnotationsOptional {
  const annotation = getTableOdataAnnotationsForResponse(
    account,
    table,
    urlPrefix
  );

  if (
    accept &&
    (accept === MINIMAL_METADATA_ACCEPT || accept === FULL_METADATA_ACCEPT)
  ) {
    tableLike.odatametadata = annotation.odatametadata;
  }

  if (accept && accept === FULL_METADATA_ACCEPT) {
    tableLike.odatatype = annotation.odatatype;
    tableLike.odataid = annotation.odataid;
    tableLike.odataeditLink = annotation.odataeditLink;
  }

  return tableLike;
}

export function getEntityOdataAnnotationsForRequest(
  account: string,
  table: string,
  partitionKey?: string,
  rowKey?: string
): IOdataAnnotations {
  return getOdataAnnotations(account, "", table, partitionKey, rowKey);
}

export function getEntityOdataAnnotationsForResponse(
  account: string,
  table: string,
  urlPrefix: string,
  partitionKey?: string,
  rowKey?: string,
  accept?: string
): IOdataAnnotationsOptional {
  const annotation = getOdataAnnotations(
    account,
    urlPrefix,
    table,
    partitionKey,
    rowKey
  );
  const response: IOdataAnnotationsOptional = {};

  if (
    accept &&
    (accept === MINIMAL_METADATA_ACCEPT || accept === FULL_METADATA_ACCEPT)
  ) {
    response.odatametadata = annotation.odatametadata;
  }

  if (accept && accept === FULL_METADATA_ACCEPT) {
    response.odatatype = annotation.odatatype;
    response.odataid = annotation.odataid;
    response.odataeditLink = annotation.odataeditLink;
  }

  return response;
}

export function updateEntityOdataAnnotationsForResponse(
  entity: Entity,
  account: string,
  table: string,
  urlPrefix: string,
  accept?: string
): Entity {
  const annotation = getOdataAnnotations(
    account,
    table,
    urlPrefix,
    entity.PartitionKey,
    entity.RowKey
  );

  if (
    accept &&
    (accept === MINIMAL_METADATA_ACCEPT || accept === FULL_METADATA_ACCEPT)
  ) {
    entity.odatametadata = annotation.odatametadata;
  }

  if (accept && accept === FULL_METADATA_ACCEPT) {
    entity.odatatype = annotation.odatatype;
    entity.odataid = annotation.odataid;
    entity.odataeditLink = annotation.odataeditLink;
  }

  return entity;
}

// table service APIs are in layers
// we need to ensure that table, entity, and service
// API layers are not affected when we change this odata response.
// check that change does not impact query entities & query tables
export function getOdataAnnotations(
  account: string,
  urlPrefix: string,
  table?: string,
  partitionKey?: string,
  rowKey?: string
): IOdataAnnotations {
  const urlPrefixEndWithSlash = urlPrefix.endsWith("/")
    ? urlPrefix
    : `${urlPrefix}/`;

  if (typeof partitionKey === "string" && partitionKey.length > 0) {
    if (typeof rowKey !== "string" || partitionKey.length === 0) {
      throw TypeError("PartitionKey and RowKey must provide at the same time.");
    }

    return {
      odatametadata: `${urlPrefixEndWithSlash}$metadata#${table}/@Element`,
      odatatype: `${account}.${table}`,
      odataid: `${urlPrefixEndWithSlash}${table}(PartitionKey='${partitionKey}',RowKey='${rowKey}')`,
      odataeditLink: `${table}(PartitionKey='${partitionKey}',RowKey='${rowKey}')`
    };
  } else {
    return {
      odatametadata: `${urlPrefixEndWithSlash}$metadata#Tables${
        table ? "/@Element" : ""
      }`,
      odatatype: `${account}.Tables`,
      odataid: `${urlPrefixEndWithSlash}Tables('${table}')`,
      odataeditLink: `Tables('${table}')`
    };
  }
}

export function checkApiVersion(
  inputApiVersion: string,
  validApiVersions: Array<string>,
  context: Context
): void {
  if (!validApiVersions.includes(inputApiVersion)) {
    throw StorageErrorFactory.getInvalidAPIVersion(context, inputApiVersion);
  }
}

export function getTimestampString(date: Date): string {
  return date.toISOString().replace("Z", "0000Z");
}

export function getPayloadFormat(context: Context): string {
  let format = context.request?.getHeader(HeaderConstants.ACCEPT);

  const formatParameter = context.request?.getQuery("$format");
  if (typeof formatParameter === "string") {
    format = formatParameter;
  }

  if (format === undefined || format === "") {
    format = XML_METADATA;
  }

  if (format === "application/json") {
    format = MINIMAL_METADATA_ACCEPT;
  }

  format = format.replace(/\s/g, "");

  return format;
}

// https://docs.microsoft.com/en-us/rest/api/storageservices/understanding-the-table-service-data-model#table-names
export function validateTableName(context: Context, tableName: string) {
  if (tableName !== "" && (tableName!.length < 3 || tableName!.length > 63)) {
    throw StorageErrorFactory.getOutOfRangeName(context);
  }
  const reg = new RegExp("^[A-Za-z][A-Za-z0-9]{2,62}$");
  if (!reg.test(tableName!) && !tableName.startsWith("$Metric")) {
    throw StorageErrorFactory.getInvalidResourceName(context);
  }
  if (tableName.toLowerCase() === "tables") {
    throw StorageErrorFactory.getInvalidResourceName(context);
  }
}

export function newTableEntityEtag(highPresModTime: string): string {
  // Etag as returned by Table Storage should match W/"datetime'<ISO8601datetime>'"
  // as we need the same value for last Modification time, we now only accept a string here
  return "W/\"datetime'" + encodeURIComponent(highPresModTime) + "'\"";
}

export function newHighPrecisionTimeStamp(startTime: Date): string {
  return truncatedISO8061Date(startTime, true, true);
}

/**
 * Checks if an eTag is valid
 *
 * @export
 * @param {string} etag
 * @return {*}  {boolean}
 */
export function isEtagValid(etag: string): boolean {
  // Weak etag is required. This is parity with Azure and legacy emulator.
  // Source for regex: https://stackoverflow.com/a/11572348
  const match = etag.match(/^[wW]\/"([^"]|\\")*"$/);
  return match === null;
}

/**
 * Get the byte size of a string in UTF8.
 *
 * @public
 * @param {Date} requestDate
 * @returns {string}
 */
export function getUTF8ByteSize(text: string): number {
  return Buffer.from(text, "utf8").length;
}
