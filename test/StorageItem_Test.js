'use strict';

const chai = require('chai'),
    expect = chai.expect,
    StorageItem = require('./../lib/model/StorageItem'),
    Blob = require('./../lib/model/Blob');

describe('Model', () => {
    describe('StorageItem', () => {
        it('should initialize properties ETags, Last-Modified, Content-Type and Content-Encoding if they are missing.', () => {
            const item = new StorageItem('testItem', {});
            expect(item).to.have.property('name', 'testItem');
            expect(item.httpProps).to.have.property('ETag', 1);
            expect(item.httpProps).to.have.property('Last-Modified');
            expect(item.httpProps).to.have.property('Content-Type', 'application/octet-stream');
            expect(item.httpProps).to.have.property('Content-Encoding', 'utf8');
            expect(item.httpProps).to.not.have.property('Content-MD5');
            expect(item.httpProps).to.not.have.property('Content-Language');
            expect(item.httpProps).to.not.have.property('Cache-Control');
            expect(item.metaProps).to.be.empty;
        });
        it('should initialize meta and http props correctly.', () => {
            const httpHeader = {
                'x-ms-meta-key1': 'value1',
                'x-ms-meta-key2': 'value2',
                'Content-Type': 'ContentType',
                'Content-Encoding': 'ContentEncoding',
                'Content-MD5': 'ContentMD5',
                'Content-Language': 'ContentLanguage',
                'Cache-Control': 'CacheControl'
            };
            const item = new StorageItem('testItem', httpHeader);
            expect(item.httpProps).to.have.property('ETag', 1);
            expect(item.httpProps).to.have.property('Last-Modified');
            expect(item.httpProps).to.have.property('Content-Type', 'ContentType');
            expect(item.httpProps).to.have.property('Content-Encoding', 'ContentEncoding');
            expect(item.httpProps).to.have.property('Content-MD5', 'ContentMD5');
            expect(item.httpProps).to.have.property('Content-Language', 'ContentLanguage');
            expect(item.httpProps).to.have.property('Cache-Control', 'CacheControl');
            expect(item.metaProps).to.have.property('key1', 'value1');
            expect(item.metaProps).to.have.property('key2', 'value2');
        });
    });
    describe('Blob', () => {
        it('should throw an error when BlobType is not supported.', () => {
            expect(function () {
                new Blob('testBlob', null, 'NOT_SUPPORTED_BLOB_TYPE');
            }).to.throw('Unsupported Blob Type');
        });
        it('should successfully create a Blob object when blob type is supported', () => {
            expect(function () {
                new Blob('testBlob', null, 'BlockBlob');
            }).to.not.throw(Error);
            expect(function () {
                new Blob('testBlob', null, 'AppendBlob');
            }).to.not.throw(Error);
        });
    });
});