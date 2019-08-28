/** @format */

"use strict";

const ODataMode = require("./../../core/Constants").ODataMode,
  BaseProxy = require("./BaseProxy"),
  InternalAzuriteError = require("./../../core/InternalAzuriteError");

class EntityProxy extends BaseProxy {
  constructor(entity) {
    super(entity);
    this.partitionKey = entity.partitionKey;
    this.rowKey = entity.rowKey;
    this.etag = `${entity.odata.etag}`;
  }

  /**
   * Returns the odata representation of the 'Entity' entity.
   *
   * @param {any} mode is (nometadata|minimalmetadata|fullmetadata)
   * @returns
   * @memberof EntityProxy
   */
  odata(mode) {
    const odata = super.odata(mode);
    if (mode === ODataMode.FULL) {
      odata["odata.etag"] = this._.odata.etag;
    }
    return odata;
  }

  /**
   * Returns all attributes (including partition key, row key) of the entity, and
   * depending on @param mode the odata type specifications.
   *
   * @param {any} mode is (nometadata|minimalmetadata|fullmetadata)
   * @returns
   * @memberof EntityProxy
   */
  attribs(mode) {
    // this is described here:
    // https://docs.microsoft.com/en-us/rest/api/storageservices/payload-format-for-table-service-operations
    let filteredAttribs = {};
    if (mode === ODataMode.FULL) {
      return this._.attribs; // also return the OData type specifications
    } else if (mode === ODataMode.MINIMAL) {
      // In case of no metadata we filter out most of the OData info and "Timestamp@odata.type"

      for (const key of Object.keys(this._.attribs)) {
        if (key.includes("Timestamp@odata.type")) {
          continue;
        }
        filteredAttribs[key] = this._.attribs[key];
      }
    } else {
      // In case of no metadata we filter out all the OData type specifications
      const attribs = {};
      for (const key of Object.keys(this._.attribs)) {
        if (key.includes("@odata.type")) {
          continue;
        }
        filteredAttribs[key] = this._.attribs[key];
      }
    }
    return filteredAttribs;
  }
}

module.exports = EntityProxy;
