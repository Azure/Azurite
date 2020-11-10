import StorageErrorFactory from "../errors/StorageErrorFactory";
import { TableResponseProperties } from "../generated/artifacts/models";
import {
  Entity,
  IOdataAnnotations,
  IOdataAnnotationsOptional,
  Table
} from "../persistence/ITableMetadataStore";
import {
  FULL_METADATA_ACCEPT,
  HeaderConstants,
  MINIMAL_METADATA_ACCEPT
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
      odatametadata: `${urlPrefixEndWithSlash}$metadata#${table}`,
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
  requestId: string
): void {
  if (!validApiVersions.includes(inputApiVersion)) {
    throw StorageErrorFactory.getInvalidHeaderValue(requestId, {
      HeaderName: HeaderConstants.X_MS_VERSION,
      HeaderValue: inputApiVersion
    });
  }
}

export function getTimestampString(date: Date): string {
  return date.toISOString().replace("Z", "0000Z");
}
