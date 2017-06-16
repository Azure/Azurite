'use strict';

const env = require('./env'),
    path = require('path'),
    BbPromise = require('bluebird'),
    Loki = require('lokijs'),
    fs = BbPromise.promisifyAll(require("fs-extra")),
    crypto = require('crypto'),
    StorageTables = require('./Constants').StorageTables,
    BlobTypes = require('./Constants').BlobTypes,
    CombinedStream = require('combined-stream'),
    Blob = require('./model/Blob'),
    // Validation
    RootValidator = require('./validation/RootValidator'),
    AppendBlobSanityVal = require('./validation/AppendBlobSanity'),
    BlobCreationSizeVal = require('./validation/BlobCreationSize'),
    BlockPageSizeVal = require('./validation/BlockPageSize'),
    SupportedBlobTypeVal = require('./validation/SupportedBlobType'),
    CompatibleBlobTypeVal = require('./validation/CompatibleBlobType'),
    MD5Val = require('./validation/MD5'),
    ConflictingItemVal = require('./validation/ConflictingItem'),
    ContentLengthExistsVal = require('./validation/ContentLengthExists'),
    ContainerExistsVal = require('./validation/ContainerExists'),
    BlobExistsVal = require('./validation/BlobExists'),
    IsOfBlobTypeVal = require('./validation/IsOfBlobType'),
    RangeVal = require('./validation/Range'),
    PageAlignmentVal = require('./validation/PageAlignment'),
    NumOfSignedIdentifiersVal = require('./validation/NumOfSignedIdentifiers'),
    PutBlobHeaderVal = require('./validation/PutBlobHeaders'),
    ConditionalRequestHeadersVal = require('./validation/ConditionalRequestHeaders'),
    PageBlobHeaderSanityVal = require('./validation/PageBlobHeaderSanity');

class StorageManager {
    constructor() {
    }

    init(localStoragePath) {
        this.db = BbPromise.promisifyAll(new Loki(env.azuriteDBPath, { autosave: true, autosaveInterval: 5000 }));
        return fs.statAsync(env.azuriteDBPath)
            .then((stat) => {
                return this.db.loadDatabaseAsync({});
            })
            .then((data) => {
                if (!this.db.getCollection(StorageTables.Containers)) {
                    this.db.addCollection(StorageTables.Containers);
                }
                if (!this.db.getCollection(StorageTables.Commits)) {
                    this.db.addCollection(StorageTables.Commits);
                }
                if (!this.db.getCollection(StorageTables.Pages)) {
                    this.db.addCollection(StorageTables.Pages);
                }
                return this.db.saveDatabaseAsync();
            })
            .catch((e) => {
                if (e.code === 'ENOENT') {
                    // No DB has been persisted / initialized yet.
                    this.db.addCollection(StorageTables.Containers);
                    this.db.addCollection(StorageTables.Commits);
                    this.db.addCollection(StorageTables.Pages);
                    return this.db.saveDatabaseAsync();
                }
                // This should never happen!
                console.error(`Failed to initialize database at "${env.azuriteDBPath}"`);
                throw e;
            });
    }

    flush() {
        return this.db.saveDatabaseAsync();
    }

    createContainer(model) {
        return BbPromise.try(() => {
            let coll = this.db.getCollection(StorageTables.Containers);
            let containerPath = path.join(env.localStoragePath, model.name);
            new RootValidator({
                collection: coll,
                containerName: model.name
            })
                .run(ConflictingItemVal);

            coll.insert({ name: model.name, httpProps: model.httpProps, metaProps: model.metaProps, access: model.access });
            this.db.addCollection(model.name);
            return fs.mkdirAsync(containerPath)
        });
    }

    deleteContainer(name) {
        return BbPromise.try(() => {
            let container = path.join(env.localStoragePath, name);
            let coll = this.db.getCollection(StorageTables.Containers);
            new RootValidator({
                collection: coll,
                containerName: name
            })
                .run(ContainerExistsVal);

            coll.chain().find({ 'name': { '$eq': name } }).remove();
            this.db.removeCollection(name);
            // TODO: Remove Blocks in Committed Directory and Committed Blocks in DB
            return fs.remove(container)
        });
    }

    listContainer(prefix, maxresults) {
        return BbPromise.try(() => {
            maxresults = parseInt(maxresults);
            let tables = this.db.getCollection(StorageTables.Containers);
            let result = tables.chain()
                .find({ 'name': { '$contains': prefix } })
                .simplesort('name')
                .limit(maxresults)
                .data();
            return result;
        });
    }

    putBlob(containerName, blob, body) {
        return BbPromise.try(() => {
            const response = {};
            response['Content-MD5'] =
                crypto.createHash('md5')
                    .update(body)
                    .digest('base64');

            let coll = this.db.getCollection(containerName);
            const blobResult = coll ? coll.chain().find({ 'name': { '$eq': blob.name } }).data() : [];

            new RootValidator({
                containerName: containerName,
                requestBlob: blob,
                body: body,
                collection: this.db.getCollection(StorageTables.Containers),
            })
                .run(MD5Val)
                .run(ContainerExistsVal)
                .run(CompatibleBlobTypeVal, { updateBlob: blobResult[0] }, blobResult.length === 0) // skipped if empty result
                .run(SupportedBlobTypeVal)
                .run(PutBlobHeaderVal)
                .run(BlobCreationSizeVal);

            if (blobResult.length === 0) {
                const newBlob = coll.insert({
                    name: blob.name,
                    httpProps: blob.httpProps,
                    metaProps: blob.metaProps,
                    blobType: blob.blobType,
                    // x-ms-blob-content-length is set only for page blobs
                    size: blob.httpProps['x-ms-blob-content-length'] || body.length,
                    snapshot: false
                });
                response.ETag = newBlob.meta.revision;
                response['Last-Modified'] = blob.httpProps['Last-Modified'];
            } else {
                const updateBlob = blobResult[0];
                updateBlob.httpProps = blob.httpProps;
                updateBlob.metaProps = blob.metaProps;
                updateBlob.size += body.length;
                coll.update(updateBlob);
                response.ETag = updateBlob.meta.revision;
                response['Last-Modified'] = blob.httpProps['Last-Modified'];
            }
            return fs.outputFileAsync(this._getStoragePath(containerName, blob), body, { encoding: blob.httpProps['Content-Encoding'] })
                .then(() => {
                    return response;
                });
        });
    }

    putAppendBlock(containerName, blob, body) {
        return BbPromise.try(() => {
            const response = {};
            const collAndBlob = this._getCollectionAndBlob(containerName, blob.name),
                coll = collAndBlob.coll,
                updateBlob = collAndBlob.blob;

            updateBlob.httpProps['x-ms-blob-committed-block-count'] += 1;

            new RootValidator({
                containerName: containerName,
                requestBlob: blob,
                updateBlob: updateBlob,
                body: body,
                collection: this.db.getCollection(StorageTables.Containers),
            })
                .run(ContentLengthExistsVal)
                .run(ContainerExistsVal)
                .run(BlockPageSizeVal)
                .run(MD5Val)
                .run(AppendBlobSanityVal);

            response['Content-MD5'] =
                crypto.createHash('md5')
                    .update(body)
                    .digest('base64');
            response['x-ms-blob-committed-block-count'] = updateBlob.httpProps['x-ms-blob-committed-block-count'];
            response['x-ms-blob-append-offset'] = updateBlob.size;

            updateBlob.httpProps['Last-Modified'] = blob.httpProps['Last-Modified'];
            updateBlob.size += body.length;
            coll.update(updateBlob);
            return fs.appendFileAsync(this._getStoragePath(containerName, blob), body, { encoding: updateBlob.httpProps['Content-Encoding'] })
                .then(() => {
                    return response;
                });
        });
    }

    deleteBlob(containerName, blob) {
        return BbPromise.try(() => {
            let coll = this.db.getCollection(containerName);
            new RootValidator({
                requestBlob: { name: blob.name },
                collection: coll
            })
                .run(BlobExistsVal);

            coll.chain().find({ 'name': { '$eq': blob.name } }).remove();
            return fs.removeAsync(this._getStoragePath(containerName, blob));
        });
    }

    getBlob(containerName, requestBlob) {
        return BbPromise.try(() => {
            const response = {};
            response.x_ms_server_encrypted = false;
            const coll = this.db.getCollection(containerName);
            new RootValidator({
                requestBlob: requestBlob,
                collection: coll
            })
                .run(BlobExistsVal)
                .run(RangeVal);

            const blob = coll.chain()
                .find({ 'name': { '$eq': requestBlob.name } })
                .data()[0];
            response.httpProps = blob.httpProps;
            response.metaProps = blob.metaProps;
            response.httpProps.ETag = blob.meta.revision;
            response.httpProps['x-ms-blob-type'] = blob.blobType;
            return response;
        });
    }

    listBlobs(containerName, options) {
        return BbPromise.try(() => {
            const coll = this.db.getCollection(containerName);
            new RootValidator({
                containerName: containerName,
                collection: this.db.getCollection(StorageTables.Containers)
            })
                .run(ContainerExistsVal);

            let blobs = coll.chain()
                .find({ 'name': { '$contains': options.prefix } })
                .simplesort('name')
                .limit(options.maxresults);
            if (options.marker) {
                let offset = parseInt(options.marker);
                offset *= (options.maxresults || 1000);
                blobs.offset(offset);
            }
            const result = blobs.data();
            return result;
        });
    }

    putBlock(containerName, blobName, body, options) {
        return BbPromise.try(() => {
            const response = {};
            let containerColl = this.db.getCollection(containerName);
            new RootValidator({
                containerName: containerName,
                body: body,
                collection: this.db.getCollection(StorageTables.Containers),
                requestBlob: options.blob
            })
                .run(ContentLengthExistsVal)
                .run(BlockPageSizeVal)
                .run(ContainerExistsVal)
                .run(MD5Val);

            response['Content-MD5'] =
                crypto.createHash('md5')
                    .update(body)
                    .digest('base64');
            const parentBlobResult = containerColl.chain()
                .find({ 'name': { '$eq': blobName } })
                .data();
            // We only create the blob in DB if it does not already exists.
            if (parentBlobResult.length === 0) {
                containerColl.insert({
                    name: blobName,
                    httpProps: options.blob.httpProps,
                    blobType: BlobTypes.BlockBlob,
                    committed: false,
                    size: 0,
                    snapshot: false
                });
            }

            // Storing block information in DB.
            const commitColl = this.db.getCollection(StorageTables.Commits);
            const blobResult = commitColl.chain()
                .find({ 'name': { '$eq': options.fileName } })
                .data();

            if (blobResult.length === 0) {
                const newBlob = commitColl.insert({
                    name: options.fileName,
                    blockId: options.blockId,
                    parent: options.parent,
                    httpProps: options.blob.httpProps,
                    size: body.length, // in bytes
                    committed: false

                });
                response.ETag = newBlob.meta.revision;
                response['Last-Modified'] = options.blob.httpProps['Last-Modified'];
            } else {
                const updateBlob = blobResult[0];
                updateBlob.httpProps = options.blob.httpProps;
                updateBlob.size = body.length;
                updateBlob.committed = false;
                commitColl.update(updateBlob);
                response.ETag = updateBlob.meta.revision;
                response['Last-Modified'] = options.blob.httpProps['Last-Modified'];
            }
            // Make sure that the parent blob exists on storage.
            return fs.ensureFileAsync(this._getStoragePath(containerName, options.blob))
                .then(() => {
                    // Writing block to disk.
                    const blockPath = path.join(env.commitsPath, options.fileName);
                    return fs.outputFileAsync(this._escapeBlobDelimiter(blockPath), body, { encoding: options.blob.httpProps['Content-Encoding'] });
                })
                .then(() => {
                    return response;
                });
        });
    }

    putBlockList(containerName, blob, blockList) {
        return BbPromise.try(() => {
            const response = {};
            let blockPaths = [];
            const validator = new RootValidator({
                collection: this.db.getCollection(StorageTables.Commits)
            });
            for (const block of blockList) {
                const blockName = `${containerName}-${blob.name}-${block.id}`;
                blockPaths.push(path.join(env.commitsPath, blockName));
                validator.run(BlobExistsVal, {
                    requestBlob: { name: blockName }
                });
            }
            validator
                .run(ContainerExistsVal, {
                    containerName: containerName,
                    collection: this.db.getCollection(StorageTables.Containers)
                });

            // Updating properties of blob
            const coll = this.db.getCollection(containerName);
            const blobResult = coll.chain()
                .find({ 'name': { '$eq': blob.name } })
                .data();

            if (blobResult.length == 0) {
                const newBlob = coll.insert({
                    name: blob.name,
                    httpProps: blob.httpProps,
                    metaProps: blob.metaProps,
                    blobType: blob.blobType,
                    size: 0,
                    snapshot: false
                });
                response.ETag = newBlob.meta.revision;
                response['Last-Modified'] = blob.httpProps['Last-Modified'];
            } else {
                const updateBlob = blobResult[0];
                updateBlob.httpProps = blob.httpProps;
                updateBlob.metaProps = blob.metaProps;
                coll.update(updateBlob);
                response.ETag = updateBlob.meta.revision;
                response['Last-Modified'] = blob.httpProps['Last-Modified'];
            }

            // Writing multiple blocks to one blob
            const combinedStream = CombinedStream.create();
            for (const blockName of blockPaths) {
                combinedStream.append(fs.createReadStream(blockName));
            }

            return new BbPromise((resolve, reject) => {
                const destinationStream = fs.createWriteStream(this._getStoragePath(containerName, blob));
                destinationStream
                    .on('error', (e) => {
                        reject(e);
                    })
                    .on('finish', () => {
                        let totalSize = 0;
                        // Set Blocks in DB to committed = true, delete blocks not in BlockList
                        const promises = [];
                        const collCommits = this.db.getCollection(StorageTables.Commits);
                        const blocks = collCommits.chain()
                            .find({ parent: `${containerName}-${blob.name}` })
                            .data();
                        for (const block of blocks) {
                            if (blockList.map((e) => { return e.id }).indexOf(block.blockId) !== -1) {
                                block.committed = true;
                                totalSize += block.size;
                                collCommits.update(block);
                            } else {
                                collCommits.remove(block);
                                promises.push(fs.removeAsync(path.join(env.commitsPath, block.name)));
                            }
                        }
                        return BbPromise.all(promises)
                            .then(() => {
                                const updateBlob = coll.chain()
                                    .find({ 'name': { '$eq': blob.name } })
                                    .data()[0];
                                updateBlob.size = totalSize;
                                coll.update(updateBlob);
                                resolve(response);
                            });
                    });
                combinedStream.pipe(destinationStream);
            });
        });
    }

    getBlockList(containerName, blobName, blockListType) {
        return BbPromise.try(() => {
            let response = {};
            const coll = this.db.getCollection(containerName)
            let requestBlob = coll ? this.db.getCollection(containerName).find({ name: blobName })[0] : null;
            if (requestBlob && requestBlob.length > 0) {
                requestBlob = requestBlob[0];
            }
            new RootValidator({
                requestBlob: requestBlob,
                collection: coll
            })
                .run(ContainerExistsVal, { containerName: containerName, collection: this.db.getCollection(StorageTables.Containers) })
                .run(BlobExistsVal)
                .run(SupportedBlobTypeVal)
                .run(IsOfBlobTypeVal, { blobType: BlobTypes.BlockBlob });

            const query = this._buildBlockListQuery(containerName, blobName, blockListType);
            const blocks = this.db.getCollection(StorageTables.Commits)
                .chain()
                .find(query)
                .data();
            response.blocks = blocks;
            const parentBlob = this.db.getCollection(containerName).find({ name: blobName });
            response.parentBlob = parentBlob[0];
            return response;
        });
    }

    setBlobMetadata(containerName, blob) {
        return BbPromise.try(() => {
            new RootValidator()
                .run(ContainerExistsVal, {
                    containerName: containerName,
                    collection: this.db.getCollection(StorageTables.Containers)
                })
                .run(BlobExistsVal, {
                    requestBlob: blob,
                    collection: this.db.getCollection(containerName)
                });

            const res = this._getCollectionAndBlob(containerName, blob.name),
                coll = res.coll,
                blobToUpdate = res.blob;
            blobToUpdate.metaProps = blob.metaProps;
            blobToUpdate.httpProps['Last-Modified'] = blob.httpProps['Last-Modified'];
            coll.update(blobToUpdate);
            return {
                ETag: blobToUpdate.meta.revision,
                'Last-Modified': blobToUpdate.httpProps['Last-Modified']
            };
        });
    }

    getBlobMetadata(containerName, blobName) {
        return BbPromise.try(() => {
            new RootValidator()
                .run(ContainerExistsVal, {
                    containerName: containerName,
                    collection: this.db.getCollection(StorageTables.Containers)
                })
                .run(BlobExistsVal, {
                    requestBlob: { name: blobName },
                    collection: this.db.getCollection(containerName)
                });
            const res = this._getCollectionAndBlob(containerName, blobName),
                blob = res.blob,
                httpProps = blob.httpProps,
                metaProps = blob.metaProps;
            // Since auto-update of LokiJS is active, we clone httpProps. 
            // Otherwise attributes such as Content-Length would be updated and possibly used for
            // operations where Content-Length is supposed to be 0.
            let clonedHttpProps = Object.assign({}, httpProps);
            clonedHttpProps.ETag = blob.meta.revision;
            clonedHttpProps['Content-Length'] = blob.size;
            clonedHttpProps['x-ms-blob-type'] = blob.blobType;
            return {
                httpProps: clonedHttpProps,
                metaProps: metaProps
            };
        });
    }

    setBlobProperties(containerName, blob) {
        return BbPromise.try(() => {
            new RootValidator()
                .run(ContainerExistsVal, {
                    containerName: containerName,
                    collection: this.db.getCollection(StorageTables.Containers)
                })
                .run(BlobExistsVal, {
                    requestBlob: blob,
                    collection: this.db.getCollection(containerName)
                });
            const res = this._getCollectionAndBlob(containerName, blob.name),
                blobToUpdate = res.blob,
                coll = res.coll;
            blobToUpdate.httpProps = blob.httpProps;
            coll.update(blobToUpdate);
            return {
                'Last-Modified': blobToUpdate.httpProps['Last-Modified'],
                ETag: blobToUpdate.meta.revision
            };
        });
    }

    getBlobProperties(containerName, blobName) {
        // For block blobs return values are equal in Azurite
        return this.getBlobMetadata(containerName, blobName);
    }

    setContainerMetadata(container) {
        return BbPromise.try(() => {
            new RootValidator()
                .run(ContainerExistsVal, {
                    containerName: container.name,
                    collection: this.db.getCollection(StorageTables.Containers)
                });
            const res = this._getCollectionAndContainer(container.name),
                containerToUpdate = res.container,
                coll = res.coll;
            containerToUpdate.metaProps = container.metaProps;
            containerToUpdate.httpProps['LastModified'] = container.httpProps['Last-Modified'];
            coll.update(containerToUpdate);
            return {
                'Last-Modified': containerToUpdate.httpProps['Last-Modified'],
                ETag: containerToUpdate.meta.revision
            }
        });
    }

    getContainerMetadata(containerName) {
        return BbPromise.try(() => {
            new RootValidator()
                .run(ContainerExistsVal, {
                    containerName: containerName,
                    collection: this.db.getCollection(StorageTables.Containers)
                });
            const res = this._getCollectionAndContainer(containerName),
                httpProps = res.container.httpProps,
                metaProps = res.container.metaProps;
            httpProps.ETag = res.container.meta.revision;
            return {
                httpProps: httpProps,
                metaProps: metaProps
            };
        });
    }

    getContainerProperties(containerName) {
        return BbPromise.try(() => {
            new RootValidator()
                .run(ContainerExistsVal, {
                    containerName: containerName,
                    collection: this.db.getCollection(StorageTables.Containers)
                });
            const res = this._getCollectionAndContainer(containerName),
                httpProps = res.container.httpProps,
                metaProps = res.container.metaProps;
            httpProps.ETag = res.container.meta.revision;
            if (res.container.access !== 'private') {
                httpProps['x-ms-blob-public-access'] = res.container.access;
            }
            return {
                httpProps: httpProps,
                metaProps: metaProps
            };
        });
    }

    putPage(containerName, blob, body) {
        return BbPromise.try(() => {
            new RootValidator({
                body: body,
                requestBlob: blob
            })
                .run(ContainerExistsVal, {
                    containerName: containerName,
                    collection: this.db.getCollection(StorageTables.Containers)
                })
                .run(BlobExistsVal, {
                    collection: this.db.getCollection(containerName)
                })
                .run(ContentLengthExistsVal)
                // .run(IsOfBlobTypeVal, { blobType: BlobTypes.PageBlob }) // TODO: Refactor line 386
                .run(MD5Val)
                .run(BlockPageSizeVal)
                .run(PageAlignmentVal)
                .run(PageBlobHeaderSanityVal);

            const parts = blob.httpProps['range'].split('=')[1].split('-'),
                startByte = parseInt(parts[0]),
                endByte = parseInt(parts[1]);
            // Getting overlapping pages (sorted by startByte in ascending order)
            const collPages = this.db.getCollection(StorageTables.Pages);
            const pageRanges = collPages.chain()
                .find({
                    '$and': [
                        { 'end': { '$gte': startByte / 512 } },
                        { 'start': { '$lte': (endByte + 1) / 512 } },
                        { 'name': { '$eq': `${containerName}-${blob.name}` } }]
                })
                .sort((a, b) => {
                    return a.start - b.start;
                })
                .data();

            this._updatePageRanges(collPages, pageRanges, startByte, endByte, `${containerName}-${blob.name}`);

            const pageWriteMode = blob.httpProps['x-ms-page-write'],
                blobPath = path.join(env.localStoragePath, containerName, blob.name),
                writeStream = fs.createWriteStream(this._escapeBlobDelimiter(blobPath), {
                    flags: 'r+',
                    start: startByte,
                    defaultEncoding: 'utf8'
                });

            let pageContent;
            if (pageWriteMode === 'UPDATE') {
                pageContent = body;
            }
            if (pageWriteMode === 'CLEAR') {
                pageContent = new Array(endbyte - startbyte + 1).fill('\0').join('');
            }
            return new BbPromise((resolve, reject) => {
                writeStream
                    .on('error', (e) => {
                        reject(e);
                    })
                    .on('finish', () => {
                        const coll = this.db.getCollection(containerName);
                        const updatedBlob = coll.chain().find({ name: { '$eq': blob.name } }).data()[0];
                        // Updating Blobsize and sequence number
                        updatedBlob.size = fs.statSync(blobPath).size;
                        updatedBlob.httpProps['x-ms-blob-sequence-number'] = updatedBlob.meta.revision;
                        // Fixme: For some reason this is sometimes set to blob.size
                        updatedBlob.httpProps['Content-Length'] = 0;
                        coll.update(updatedBlob);
                        resolve(updatedBlob.httpProps);
                    });
                writeStream.write(pageContent);
                writeStream.end();
            });
        });
    }

    getPageRanges(containerName, blob) {
        return BbPromise.try(() => {
            new RootValidator({
                requestBlob: blob
            })
                .run(ContainerExistsVal, {
                    containerName: containerName,
                    collection: this.db.getCollection(StorageTables.Containers)
                })
                .run(BlobExistsVal, {
                    collection: this.db.getCollection(containerName)
                })
                .run(PageAlignmentVal);

            let pageRanges;
            const collPages = this.db.getCollection(StorageTables.Pages);
            if (blob.httpProps['range']) {
                // If range exists it is guaranteed to be well-formed due to PageAlignment validation
                const parts = blob.httpProps['range'].split('=')[1].split('-'),
                    startByte = parseInt(parts[0]),
                    endByte = parseInt(parts[1]);
                pageRanges = collPages.chain()
                    .find({
                        '$and': [
                            { 'end': { '$gte': startByte } },
                            { 'start': { '$lte': endByte } },
                            { 'name': { '$eq': `${containerName}-${blob.name}` } }]
                    })
                    .sort((a, b) => {
                        return a.start - b.start;
                    })
                    .data();
            } else {
                pageRanges = collPages.chain()
                    .find({ 'name': { '$eq': `${containerName}-${blob.name}` } })
                    .sort((a, b) => {
                        return a.start - b.start;
                    })
                    .data();
            }

            const res = this._getCollectionAndBlob(containerName, blob.name);
            return {
                pageRanges: pageRanges,
                httpProps: res.blob.httpProps
            };
        });
    }

    setContainerAcl(container, signedIdentifiers) {
        return BbPromise.try(() => {
            new RootValidator({
                containerName: container.name,
                collection: this.db.getCollection(StorageTables.Containers),
                model: signedIdentifiers
            })
                .run(ContainerExistsVal)
                .run(NumOfSignedIdentifiersVal);

            const res = this._getCollectionAndContainer(container.name),
                coll = res.coll,
                updateContainer = res.container;
            updateContainer.httpProps = container.httpProps;
            updateContainer.signedIdentifiers = signedIdentifiers;
            updateContainer.access = container.access;
            coll.update(updateContainer);
            return {
                ETag: updateContainer.meta.revision,
                'Last-Modified': updateContainer.httpProps['Last-Modified']
            }
        });
    }

    getContainerAcl(containerName) {
        return BbPromise.try(() => {
            new RootValidator({
                containerName: containerName,
                collection: this.db.getCollection(StorageTables.Containers)
            })
                .run(ContainerExistsVal);

            const res = this._getCollectionAndContainer(containerName),
                container = res.container;
            const props = {
                ETag: container.meta.revision,
                'Last-Modified': container.httpProps['Last-Modified'],
            }
            if (container.access !== 'private') {
                props['x-ms-blob-public-access'] = container.access;
            }
            return {
                props: props,
                signedIdentifiers: container.signedIdentifiers,
            }
        });
    }

    snapshotBlob(containerName, requestBlob) {
        return BbPromise.try(() => {
            new RootValidator({
                requestBlob: requestBlob,
            })
                .run(ContainerExistsVal, {
                    containerName: containerName,
                    collection: this.db.getCollection(StorageTables.Containers)
                })
                .run(BlobExistsVal, {
                    collection: this.db.getCollection(containerName)
                })
                .run(ConditionalRequestHeadersVal, {
                    updateBlob: this.db.getCollection(containerName).chain().find({ 'name': { '$eq': requestBlob.name } }).data()[0]
                });

            const collAndBlob = this._getCollectionAndBlob(containerName, requestBlob.name),
                coll = collAndBlob.coll,
                updateBlob = collAndBlob.blob;

            const snapshotBlob = Blob.clone(updateBlob);
            snapshotBlob.snapshot = true;

            if (Object.keys(requestBlob.metaProps).length > 0) {
                snapshotBlob.metaProps = requestBlob.metaProps;
                snapshotBlob.ETag += 1;
                snapshotBlob.httpProps['Last-Modified'] = requestBlob.httpProps['Last-Modified'];
            }

            snapshotBlob.name = snapshotBlob.publicName();
            coll.insert(snapshotBlob);

            const destPath = path.join(env.snapshotPath, containerName, snapshotBlob.name);
            return fs.ensureDirAsync(path.join(env.snapshotPath, containerName))
                .then(() => {
                    return fs.copyAsync(this._getStoragePath(containerName, requestBlob), destPath);
                })
                .then(() => {
                    return {
                        httpProps: snapshotBlob.httpProps,
                        'x-ms-snapshot': updateBlob.httpProps['Last-Modified']
                    }
                });
        });
    }

    _updatePageRanges(collPages, pageRanges, startByte, endByte, name) {
        const startAlignment = startByte / 512,
            endAlignment = (endByte + 1) / 512;
        collPages.remove(pageRanges);
        collPages.insert({
            name: name,
            start: startAlignment,
            end: endAlignment
        });
        const firstPage = pageRanges[0];
        const lastPage = pageRanges[pageRanges.length - 1];
        if (firstPage && startAlignment > firstPage.start) {
            collPages.insert({
                name: name,
                start: firstPage.start,
                end: endAlignment - 1
            });
        }
        if (lastPage && endAlignment < lastPage.end) {
            collPages.insert({
                name: name,
                start: endAlignment + 1,
                end: lastPage.end
            });
        }
    }

    /**
     * Precondition: Validation of container and blob
     * 
     * @param {String} containerName
     * @param {String} blobName
     * @returns
     * 
     * @memberOf StorageManager
     */
    _getCollectionAndBlob(containerName, blobName) {
        const coll = this.db.getCollection(containerName);
        const result = coll.chain()
            .find({ name: blobName })
            .data();
        return {
            coll: coll,
            blob: result[0]
        };
    }

    /**
     * Precondition: Validation of container
     * 
     * @param {String} containerName
     * @returns
     * 
     * @memberOf StorageManager
     */
    _getCollectionAndContainer(containerName) {
        const coll = this.db.getCollection(StorageTables.Containers);
        const result = coll.chain()
            .find({ name: containerName })
            .data();
        return {
            coll: coll,
            container: result[0]
        };
    }

    _buildBlockListQuery(containerName, blobName, blockListType) {
        let query = {
            '$and': [{
                parent: `${containerName}-${blobName}`
            },
            {
                committed: (blockListType === 'committed')
            }]
        }
        if (blockListType === 'all') {
            query['$and'].splice(1, 1);
        }
        return query;
    }

    /**
     * Based on the blob name it creates the full path to the location on disk. Virtual directories 
     * are stored in a special folder that is not accessible through the Standard REST API. This is
     * to make sure that not special characters or words need to be reserved in the regular blob workspace.
     * Since virtual directories contain trailing slashes (which are invalid filename characters) we store the 
     * Base64 representation on disk. 
     * 
     * @param {any} containerName 
     * @param {any} blob 
     * @returns Full path on disk
     * 
     * @memberof StorageManager
     */
    _getStoragePath(containerName, blob) {
        let containerPath;
        if (blob.isVirtualDirectory()) {
            containerPath = path.join(env.virtualDirPath, containerName);
        } else if (blob.isSnapshot()) {
            containerPath = path.join(env.snapshotPath, containerName);
        } else {
            containerPath = path.join(env.localStoragePath, containerName);
        }
        const blobPath = path.join(containerPath, blob.publicName());
        return (blob.isVirtualDirectory())
            ? blobPath
            : this._escapeBlobDelimiter(blobPath);
    }

    /**
     * Not all allowed delimiters for blob names are valid file names. We thus replace those that are invalid with the valid 
     * delimiter @ on disk. Note that in our in-memory database and thus for the external interface we still 
     * use the originally chosen delimiter.
     */
    _escapeBlobDelimiter(blobPath) {
        if (process.platform === 'win32') {
            const pathWithoutLetter = blobPath.substr(2);
            if (pathWithoutLetter === '') {
                return blobPath;
            }
            return (blobPath.substr(0, 2) + pathWithoutLetter.replace(/(::|:|\/|\||\/\/)/g, '@'));
        } else {
            return blobPath.replace(/(::|:|\||\$)/g, '@');
        }
    }
}

module.exports = new StorageManager;