'use strict';

const InternalAzuriteError = require('./../../core/InternalAzuriteError'),
    RequestPayloadParser = require('./RequestPayloadParser'),
    Constants = require('./../../core/Constants'),
    N = require('./../../core/HttpHeaderNames');

class AzuriteTableRequest {
    constructor({
        req = undefined,
        payload = undefined }) {

        if (req === undefined) {
            throw new InternalAzuriteError('AzuriteTableRequest: req must not be undefined!');
        }
        this.httpProps = {};
        this._initHttpProps(req.headers);
        this.accept = this._parseAccept(this.httpProps[N.ACCEPT]);
        this.payload = RequestPayloadParser.parse(this.httpProps[N.CONTENT_TYPE], req.body);

        this.tableName = this.payload.TableName;
        this.partitionKey = this.payload.PartitionKey;
        this.rowKey = this.payload.RowKey;
    }

    _initHttpProps(httpHeaders) {
        this.httpProps[N.CONTENT_TYPE] = httpHeaders[N.CONTENT_TYPE] || `application/json;`;
        this.httpProps[N.ACCEPT] = httpHeaders[N.ACCEPT] || `application/json;odata=nometadata`;        
        this.httpProps[N.PREFER] = httpHeaders[N.PREFER] || `return-content`;
    }

    _parseAccept(value) {
        if (value === undefined) return undefined;
        if (value.includes(`odata=nometadata`)) return Constants.ODataMode.NONE; 
        if (value.includes(`odata=minimalmetadata`)) return Constants.ODataMode.MINIMAL;
        if (value.includes(`odata=fullmetadata`)) return Constants.ODataMode.FULL;
    }
}

module.exports = AzuriteTableRequest;