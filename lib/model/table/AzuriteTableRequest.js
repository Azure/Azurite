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

        this.tableName = this.payload.TableName || req.params[0].replace(/[\('\)]/g, '') || undefined;

        const res = this._parseEntityKeys(req.params[1] || ''),
            partitionKey = res.partitionKey,
            rowKey = res.rowKey;
        this.partitionKey = this.payload.PartitionKey || partitionKey;
        this.rowKey = this.payload.RowKey || rowKey;

        this.filter = req.query.$filter ? this._mapFilterQueryString(req.query.$filter) : undefined;
        // Maximum of 1000 items at one time are allowed, 
        // see https://docs.microsoft.com/rest/api/storageservices/query-timeout-and-pagination
        this.top = req.query.$top || 1000;

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

    _mapFilterQueryString(filter) {
        filter = filter
            // ignoring these query keywords since we compare simply on string-level
            .replace(/datetime/g, '')
            .replace(/guid/g, '')
            // A simple quotation mark is escaped with another one (i.e. ''). 
            // Since we will evaluate this string we replace simple quotation marks indictaing strings with template quotation marks
            .replace(/''/g, '@')
            .replace(/'/g, '`')
            .replace(/@/g, `'`)
            // Mapping operators
            .replace(/eq/g, '===')
            .replace(/gt/g, '>')
            .replace(/ge/g, '>=')
            .replace(/lt/g, '<')
            .replace(/le/g, '<=')
            .replace(/ne/g, '!==')
            .replace(/and/g, '&&')
            .replace(/or/g, '||')
            .replace(/not/g, '!');

        // if a token is neither a number, nor a boolean, nor a string enclosed with quotation marks it is an operand
        // Operands are attributes of the object used within the where clause of LokiJS, thus we need to prepend each
        // attribute with an object identifier 'item'.
        let transformedQuery = '';
        for (const token of filter.split(' ')) {
            if (!token.match(/\d+/) &&
                token !== 'true' && token !== 'false' &&
                !token.includes('`')) {
                transformedQuery += `item.${token} `;
            } else {
                transformedQuery += `${token} `;
            }
        }
    }
}

module.exports = AzuriteTableRequest;