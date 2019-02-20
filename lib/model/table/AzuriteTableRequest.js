/** @format */

"use strict";

const InternalAzuriteError = require("./../../core/InternalAzuriteError"),
  RequestPayloadParser = require("./RequestPayloadParser"),
  Constants = require("./../../core/Constants"),
  ODataMode = require("./../../core/Constants").ODataMode,
  N = require("./../../core/HttpHeaderNames");

class AzuriteTableRequest {
  constructor({ req = undefined, payload = undefined }) {
    if (req === undefined) {
      throw new InternalAzuriteError(
        "AzuriteTableRequest: req must not be undefined!"
      );
    }
    this.httpProps = {};
    this._initHttpProps(req.headers);
    this.accept = this._parseAccept(this.httpProps[N.ACCEPT]) || ODataMode.NONE;
    this.payload = RequestPayloadParser.parse(
      this.httpProps[N.CONTENT_TYPE],
      req.body
    );

    this.tableName =
      this.payload.TableName ||
      req.params[0].replace(/[\('\)]/g, "") ||
      undefined;

    const res = this._parseEntityKeys(req.params[1] || ""),
      partitionKey = res.partitionKey,
      rowKey = res.rowKey;
    this.partitionKey = this.payload.PartitionKey || partitionKey;
    this.rowKey = this.payload.RowKey || rowKey;

    //If PartitionKey and Rowkey is passed in header a single entity is to be retireived
    if (this.partitionKey && this.rowKey) {
      this.singleEntity = true;
    }

    this.filter = req.query.$filter
      ? this._mapFilterQueryString(decodeURI(req.query.$filter))
      : undefined;
    // Maximum of 1000 items at one time are allowed,
    // see https://docs.microsoft.com/rest/api/storageservices/query-timeout-and-pagination

    this.top = req.query.$top || 1000;

    if (
      Object.keys(this.payload).length === 0 &&
      this.payload.constructor === Object
    ) {
      this.payload === undefined;
    }
  }

  _initHttpProps(httpHeaders) {
    this.httpProps[N.DATE] = httpHeaders[N.DATE]
      ? httpHeaders[N.DATE]
      : httpHeaders["x-ms-date"];
    this.httpProps[N.CONTENT_TYPE] =
      httpHeaders[N.CONTENT_TYPE] || `application/json`;
    this.httpProps[N.ACCEPT] =
      httpHeaders[N.ACCEPT] || `application/json;odata=nometadata`;
    this.httpProps[N.PREFER] = httpHeaders[N.PREFER] || `return-content`;
    this.httpProps[N.IF_MATCH] = httpHeaders[N.IF_MATCH];
  }

  _parseAccept(value) {
    if (value === undefined) return undefined;
    if (value.includes(`odata=nometadata`)) return Constants.ODataMode.NONE;
    if (value.includes(`odata=minimalmetadata`))
      return Constants.ODataMode.MINIMAL;
    if (value.includes(`odata=fullmetadata`)) return Constants.ODataMode.FULL;
  }

  _parseEntityKeys(str) {
    const empty = {
      partitionKey: undefined,
      rowKey: undefined,
    };
    if (str === "") {
      return empty;
    }
    const regex = new RegExp(/\(PartitionKey='(.*)',\s*RowKey='(.*)'\)/);
    const res = regex.exec(str);
    if (res === null) {
      return empty;
    }
    return {
      partitionKey: res[1],
      rowKey: res[2],
    };
  }

  _mapFilterQueryString(filter) {
    filter = filter
      // ignoring these query keywords since we compare simply on a string-level
      .replace(/\bdatetime\b/g, "")
      .replace(/\bguid\b/g, "")
      // Escape a single backtick to prevent interpreting the start of a template literal.
      .replace(/`/g, '\\`')
      // A simple quotation mark is escaped with another one (i.e. '').
      // Since we will evaluate this string we replace simple quotation marks indictaing strings with template quotation marks
      .replace(/''/g, "@")
      .replace(/'/g, "`")
      .replace(/@/g, `'`)
      // Mapping 'TableName' to 'name' which is used internally as attribute name
      .replace(/\bTableName\b/g, "name")
      // Mapping operators
      .replace(/\beq\b/g, "===")
      .replace(/\bgt\b/g, ">")
      .replace(/\bge\b/g, ">=")
      .replace(/\blt\b/g, "<")
      .replace(/\ble\b/g, "<=")
      .replace(/\bne\b/g, "!==")
      .replace(/\band\b/g, "&&")
      .replace(/\bor\b/g, "||")
      .replace(/\(/g, " ( ")
      .replace(/\)/g, " ) ")
      .replace(/\bnot\b/g, " ! ");

    // If a token is neither a number, nor a boolean, nor a string enclosed with quotation marks it is an operand.
    // Operands are attributes of the object used within the where clause of LokiJS, thus we need to prepend each
    // attribute with an object identifier 'item.attribs'.
    let transformedQuery = "";
    for (const token of filter.split(" ")) {
      if (token === "") {
        continue;
      }
      if (
        !token.match(/\d+/) &&
        token !== "true" &&
        token !== "false" &&
        !token.includes("`") &&
        ![
          "===",
          ">",
          ">=",
          "<",
          "<=",
          "!==",
          "&&",
          "||",
          "!",
          "(",
          ")",
        ].includes(token)
      ) {
        if (token === "PartitionKey" || token === "RowKey") {
          transformedQuery += `item.${token[0].toLowerCase()}${token.slice(
            1
          )} `;
        } else {
          transformedQuery += `item.attribs.${token} `;
        }
      } else {
        transformedQuery += `${token} `;
      }
    }
    return transformedQuery;
  }
}

module.exports = AzuriteTableRequest;
