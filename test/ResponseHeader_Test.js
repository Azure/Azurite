'use strict';

const chai = require('chai'),
    expect = chai.expect,
    ResponseHeader = require('./../lib/model/ResponseHeader');

describe('ResponseHeader', () => {
    it('should initialize basic properties (x-ms-version and Date)', () => {
        const respHeader = new ResponseHeader();
        expect(respHeader).to.have.property('x-ms-version', '2016-05-31');
        expect(respHeader).to.have.property('Date');
    });
    it('should initialize meta and system props correctly.', () => {
        
        const metaProps = {
            'key1': 'value1',
            'key2': 'value2',
        };
        const systemProps = {
            ETag:1,
            'Last-Modified': 'LastModified',
            'Content-Type': 'ContentType',
            'Content-Encoding': 'ContentEncoding',
            'Content-MD5': 'ContentMD5',
            'Content-Language': 'ContentLanguage',
            'Cache-Control': 'CacheControl'
        };
        const optionalProps = {
            'custom-prop': 42
        }
        const respHeader = new ResponseHeader(systemProps, metaProps, optionalProps);
        expect(respHeader).to.have.property('ETag', 1);
        expect(respHeader).to.have.property('Last-Modified', 'LastModified');
        expect(respHeader).to.have.property('Content-Type', 'ContentType');
        expect(respHeader).to.have.property('Content-Encoding', 'ContentEncoding');
        expect(respHeader).to.have.property('Content-MD5', 'ContentMD5');
        expect(respHeader).to.have.property('Content-Language', 'ContentLanguage');
        expect(respHeader).to.have.property('Cache-Control', 'CacheControl');
        expect(respHeader).to.have.property('x-ms-meta-key1', 'value1');
        expect(respHeader).to.have.property('x-ms-meta-key2', 'value2');
    });
});