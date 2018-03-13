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

        this.tableName = this.payload.TableName || req.params[0].replace(/[\('\)]/g, '');

        const res = this._parseEntityKeys(req.params[1] || ''),
            partitionKey = res.partitionKey,
            rowKey = res.rowKey;
        this.partitionKey = this.payload.PartitionKey || partitionKey;
        this.rowKey = this.payload.RowKey || rowKey;

        if (Object.keys(this.payload).length === 0 && this.payload.constructor === Object) {
            this.payload === undefined;
        }
    }

    _initHttpProps(httpHeaders) {
        this.httpProps[N.CONTENT_TYPE] = httpHeaders[N.CONTENT_TYPE] || `application/json`;
        this.httpProps[N.ACCEPT] = httpHeaders[N.ACCEPT] || `application/json;odata=nometadata`;
        this.httpProps[N.PREFER] = httpHeaders[N.PREFER] || `return-content`;
    }

    _parseAccept(value) {
        if (value === undefined) return undefined;
        if (value.includes(`odata=nometadata`)) return Constants.ODataMode.NONE;
        if (value.includes(`odata=minimalmetadata`)) return Constants.ODataMode.MINIMAL;
        if (value.includes(`odata=fullmetadata`)) return Constants.ODataMode.FULL;
    }

    _parseEntityKeys(str) {
        const empty = {
            partitionKey: undefined,
            rowKey: undefined
        };
        if (str === '') {
            return empty;
        }
        const regex = new RegExp(/\(PartitionKey='(.*)',\s*RowKey='(.*)'\)/);
        const res = regex.exec(str);
        if (res === null) {
            return empty;
        }
        return {
            partitionKey: res[1],
            rowKey: res[2]
        };
    }
}

module.exports = AzuriteTableRequest;