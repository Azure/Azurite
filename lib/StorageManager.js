'use strict';

const env = require('./env'),
    utils = require('./utils'),
    path = require('path'),
    BbPromise = require('bluebird'),
    Loki = require('lokijs'),
    fs = BbPromise.promisifyAll(require("fs-extra")),
    crypto = require('crypto'),
    StorageTables = require('./Constants').StorageTables,
    BlobTypes = require('./Constants').BlobTypes,
    CombinedStream = require('combined-stream'),
    Blob = require('./model/Blob'),
    SnapshotTimeManager = require('./SnapshotTimeManager'),
    uuidv4 = require('uuid/v4'),
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
    PageBlobHeaderSanityVal = require('./validation/PageBlobHeaderSanity'),
    AssociatedSnapshotDeletion = require('./validation/AssociatedSnapshotsDeletion'),
    LeaseActionsValidation = require('./validation/LeaseActions'),
    LeaseDurationValidation = require('./validation/LeaseDuration'),
    LeaseIdValidation = require('./validation/LeaseId'),
    ContainerLeaseUsageValidation = require('./validation/ContainerLeaseUsage'),
    BlobLeaseUsageValidation = require('./validation/BlobLeaseUsage');


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

            coll.insert({ name: model.name, httpProps: model.httpProps, metaProps: model.metaProps, access: model.access, leaseState: 'available' });
            this.db.addCollection(model.name);
            return fs.mkdirAsync(containerPath)
        });
    }

    deleteContainer(name, options) {
        return BbPromise.try(() => {
            let containerPath = path.join(env.localStoragePath, name);
            let coll = this.db.getCollection(StorageTables.Containers);
            const validationContext = new RootValidator({
                collection: coll,
                containerName: name
            })
                .run(ContainerExistsVal);

            const container = coll.chain().find({ 'name': { '$eq': name } }).data()[0];
            container.leaseState = this._updateLeaseState(container.leaseState, container.leaseExpiredAt, container.leaseBrokenAt)

            validationContext.run(ContainerLeaseUsageValidation, {
                container: container,
                leaseId: options.leaseId,
                usage: 'delete'
            });

            coll.chain().find({ 'name': { '$eq': name } }).remove();
            this.db.removeCollection(name);
            // TODO: Remove Blocks in Committed Directory and Committed Blocks in DB
            return fs.remove(containerPath)
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
                .run(BlobCreationSizeVal)
                .run(BlobLeaseUsageValidation, {
                    blob: (blobResult.length === 0) ? undefined : blobResult[0],
                    leaseId: blob.httpProps['x-ms-lease-id'],
                    usage: 'write'
                }, blobResult.length === 0); // skip if blob has not been created yet

            delete blob.httpProps['Content-Length'];
            if (blobResult.length === 0) {
                const newBlob = coll.insert({
                    name: blob.name,
                    httpProps: blob.httpProps,
                    metaProps: blob.metaProps,
                    blobType: blob.blobType,
                    // x-ms-blob-content-length is set only for page blobs
                    size: blob.httpProps['x-ms-blob-content-length'] || body.length,
                    snapshot: false,
                    leaseState: 'available'
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
            return fs.outputFileAsync(env.diskStorageUri(containerName, blob), body, { encoding: blob.httpProps['Content-Encoding'] })
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
                .run(AppendBlobSanityVal)
                .run(BlobLeaseUsageValidation, {
                    usage: 'write',
                    leaseId: blob.httpProps['x-ms-lease-id'],
                    blob: updateBlob
                });

            response['Content-MD5'] =
                crypto.createHash('md5')
                    .update(body)
                    .digest('base64');
            response['x-ms-blob-committed-block-count'] = updateBlob.httpProps['x-ms-blob-committed-block-count'];
            response['x-ms-blob-append-offset'] = updateBlob.size;

            updateBlob.httpProps['Last-Modified'] = blob.httpProps['Last-Modified'];
            updateBlob.size += body.length;
            updateBlob.httpProps.ETag++;
            coll.update(updateBlob);
            return fs.appendFileAsync(env.diskStorageUri(containerName, blob), body, { encoding: updateBlob.httpProps['Content-Encoding'] })
                .then(() => {
                    return response;
                });
        });
    }

    deleteBlob(containerName, blob) {
        return BbPromise.try(() => {
            let coll = this.db.getCollection(containerName);
            new RootValidator({
                requestBlob: blob,
                collection: coll
            })
                .run(BlobExistsVal)
                .run(AssociatedSnapshotDeletion)
                .run(BlobLeaseUsageValidation, {
                    usage: 'write',
                    leaseId: blob.httpProps['x-ms-lease-id'],
                    blob: coll.chain().find({ 'name': { '$eq': blob.name } }).data()[0]
                });

            const snapshoteDeleteQueryParam = blob.httpProps['x-ms-delete-snapshots'];
            // Fixme: We are currently not deleting snapshot files from disk (need to refactor env.diskStorageUri to support wildcard expr). 
            // Since source of truth is in-memory DB this does not matter from a client's perspective, though.
            if (snapshoteDeleteQueryParam === 'include') {
                coll.chain().find({ 'name': { '$eq': blob.name } }).remove();
                coll.chain().find({ 'origin': { '$eq': blob.name } }).remove();
                return fs.removeAsync(env.diskStorageUri(containerName, blob));
            } else if (snapshoteDeleteQueryParam === 'only') {
                coll.chain().find({ 'origin': { '$eq': blob.name } }).remove();
                return BbPromise.resolve();
            } else {
                coll.chain().find({ 'name': { '$eq': blob.name } }).remove();
                return fs.removeAsync(env.diskStorageUri(containerName, blob));
            }
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
                .run(RangeVal)
                .run(BlobLeaseUsageValidation, {
                    usage: 'read',
                    leaseId: requestBlob.httpProps['x-ms-lease-id'],
                    blob: coll.chain().find({ 'name': { '$eq': blob.publicName() } }).data()[0]
                });

            const blob = coll.chain()
                .find({
                    '$and': [
                        {
                            'name': { '$eq': requestBlob.publicName() }
                        },
                        {
                            'snapshot': { '$eq': requestBlob.isSnapshot() }
                        }
                    ]
                })
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

            const condition = [];
            condition.push({
                'name': { '$contains': options.prefix }
            });
            if (options.include !== 'snapshots') {
                condition.push({
                    'snapshot': { '$eq': false }
                });
            }
            let blobs = coll.chain()
                .find({
                    '$and': condition
                })
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
            const validationContext = new RootValidator({
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

            validationContext.run(BlobLeaseUsageValidation, {
                    usage: 'write',
                    leaseId: options.blob.httpProps['x-ms-lease-id'],
                    blob: (parentBlobResult.length === 0) ? undefined : parentBlobResult[0]
                }, parentBlobResult.length === 0); // skip if blob has not been created yet

            delete options.blob.httpProps['Content-Length'];
            // We only create the blob in DB if it does not already exists.
            if (parentBlobResult.length === 0) {
                containerColl.insert({
                    name: blobName,
                    httpProps: options.blob.httpProps,
                    blobType: BlobTypes.BlockBlob,
                    committed: false,
                    size: 0,
                    snapshot: false,
                    leaseState: 'available'
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
            return fs.ensureFileAsync(env.diskStorageUri(containerName, options.blob))
                .then(() => {
                    // Writing block to disk.
                    const blockPath = path.join(env.commitsPath, options.fileName);
                    return fs.outputFileAsync(utils.escapeBlobDelimiter(blockPath), body, { encoding: options.blob.httpProps['Content-Encoding'] });
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
            const validationContext = new RootValidator({
                collection: this.db.getCollection(StorageTables.Commits)
            });
            for (const block of blockList) {
                const blockName = `${containerName}-${blob.name}-${block.id}`;
                blockPaths.push(path.join(env.commitsPath, blockName));
                validationContext.run(BlobExistsVal, {
                    requestBlob: { publicName: () => { return blockName } }
                });
            }
            validationContext
                .run(ContainerExistsVal, {
                    containerName: containerName,
                    collection: this.db.getCollection(StorageTables.Containers)
                });

            // Updating properties of blob
            const coll = this.db.getCollection(containerName);
            const blobResult = coll.chain()
                .find({ 'name': { '$eq': blob.name } })
                .data();

            validationContext.run(BlobLeaseUsageValidation, {
                    usage: 'write',
                    leaseId: blob.httpProps['x-ms-lease-id'],
                    blob: (blobResult.length === 0) ? undefined : blobResult[0]
                }, blobResult.length === 0); // Skip if blob has not been created yet

            delete blob.httpProps['Content-Length'];
            if (blobResult.length == 0) {
                const newBlob = coll.insert({
                    name: blob.name,
                    httpProps: blob.httpProps,
                    metaProps: blob.metaProps,
                    blobType: blob.blobType,
                    size: 0,
                    snapshot: false,
                    leaseState: 'available'
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
                const destinationStream = fs.createWriteStream(env.diskStorageUri(containerName, blob));
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

    getBlockList(containerName, blob, blockListType) {
        return BbPromise.try(() => {
            let response = {};
            const coll = this.db.getCollection(containerName)
            let requestBlob = coll ? this.db.getCollection(containerName).find({ name: blob.name })[0] : null;
            if (requestBlob && requestBlob.length > 0) {
                requestBlob = requestBlob[0];
            }
            new RootValidator({
                requestBlob: requestBlob,
                collection: coll
            })
                .run(ContainerExistsVal, { containerName: containerName, collection: this.db.getCollection(StorageTables.Containers) })
                .run(BlobExistsVal, { requestBlob:  blob.publicName() })
                .run(SupportedBlobTypeVal)
                .run(IsOfBlobTypeVal, { blobType: BlobTypes.BlockBlob })
                .run(BlobLeaseUsageValidation, {
                    usage: 'read',
                    leaseId: blob.httpProps['x-ms-lease-id'],
                    blob: requestBlob
                });

            const query = this._buildBlockListQuery(containerName, blob.name, blockListType);
            const blocks = this.db.getCollection(StorageTables.Commits)
                .chain()
                .find(query)
                .data();
            response.blocks = blocks;
            const parentBlob = this.db.getCollection(containerName).find({ name: blob.name });
            response.parentBlob = parentBlob[0];
            return response;
        });
    }

    setBlobMetadata(containerName, blob) {
        return BbPromise.try(() => {
            const validationContext = new RootValidator()
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

            validationContext.run(BlobLeaseUsageValidation, {
                    usage: 'write',
                    leaseId: blob.httpProps['x-ms-lease-id'],
                    blob: blobToUpdate
                });

            blobToUpdate.metaProps = blob.metaProps;
            blobToUpdate.httpProps['Last-Modified'] = blob.httpProps['Last-Modified'];
            coll.update(blobToUpdate);
            return {
                ETag: blobToUpdate.meta.revision,
                'Last-Modified': blobToUpdate.httpProps['Last-Modified']
            };
        });
    }

    getBlobMetadata(containerName, requestBlob) {
        return BbPromise.try(() => {
            const validationContext = new RootValidator()
                .run(ContainerExistsVal, {
                    containerName: containerName,
                    collection: this.db.getCollection(StorageTables.Containers)
                })
                .run(BlobExistsVal, {
                    requestBlob: requestBlob,
                    collection: this.db.getCollection(containerName)
                });
            const res = this._getCollectionAndBlob(containerName, requestBlob.publicName()),
                blob = res.blob,
                httpProps = blob.httpProps,
                metaProps = blob.metaProps;
            blob.leaseState = this._updateLeaseState(blob.leaseState, blob.leaseExpiredAt, blob.leaseBrokenAt);
            validationContext.run(BlobLeaseUsageValidation, {
                    usage: 'read',
                    leaseId: requestBlob.httpProps['x-ms-lease-id'],
                    blob: blob
                });
            // Since auto-update of LokiJS is active, we clone httpProps. 
            // Otherwise attributes such as Content-Length would be updated and possibly used for
            // operations where Content-Length is supposed to be 0.
            let clonedHttpProps = Object.assign({}, httpProps);
            clonedHttpProps.ETag = blob.meta.revision;
            clonedHttpProps['Content-Length'] = blob.size;
            clonedHttpProps['x-ms-blob-type'] = blob.blobType;
            return {
                httpProps: clonedHttpProps,
                metaProps: metaProps,
                blob: blob
            };
        });
    }

    setBlobProperties(containerName, blob) {
        return BbPromise.try(() => {
            const validationContext = new RootValidator()
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

            validationContext.run(BlobLeaseUsageValidation, {
                    usage: 'write',
                    leaseId: blob.httpProps['x-ms-lease-id'],
                    blob: blobToUpdate
                });

            blobToUpdate.httpProps = blob.httpProps;
            coll.update(blobToUpdate);
            return {
                'Last-Modified': blobToUpdate.httpProps['Last-Modified'],
                ETag: blobToUpdate.meta.revision
            };
        });
    }

    getBlobProperties(containerName, requestBlob) {
        // For block blobs return values are equal in Azurite
        return this.getBlobMetadata(containerName, requestBlob);
    }

    setContainerMetadata(containerRequest) {
        return BbPromise.try(() => {
            const validationContext = new RootValidator()
                .run(ContainerExistsVal, {
                    containerName: containerRequest.name,
                    collection: this.db.getCollection(StorageTables.Containers)
                });
            const res = this._getCollectionAndContainer(containerRequest.name),
                container = res.container,
                coll = res.coll;

            container.leaseState = this._updateLeaseState(container.leaseState, container.leaseExpiredAt, container.leaseBrokenAt)

            validationContext.run(ContainerLeaseUsageValidation, {
                container: container,
                leaseId: containerRequest.httpProps['x-ms-lease-id'],
                usage: 'other'
            });

            container.metaProps = containerRequest.metaProps;
            container.httpProps['LastModified'] = containerRequest.httpProps['Last-Modified'];
            coll.update(container);
            return {
                'Last-Modified': container.httpProps['Last-Modified'],
                ETag: container.meta.revision
            }
        });
    }

    getContainerMetadata(containerName, options) {
        return BbPromise.try(() => {
            const validationContext = new RootValidator()
                .run(ContainerExistsVal, {
                    containerName: containerName,
                    collection: this.db.getCollection(StorageTables.Containers)
                });
            const res = this._getCollectionAndContainer(containerName),
                httpProps = res.container.httpProps,
                metaProps = res.container.metaProps;

            res.container.leaseState = this._updateLeaseState(res.container.leaseState, res.container.leaseExpiredAt, res.container.leaseBrokenAt);
            validationContext.run(ContainerLeaseUsageValidation, {
                container: res.container,
                leaseId: options.leaseId,
                usage: 'other'
            });

            httpProps.ETag = res.container.meta.revision;
            return {
                httpProps: httpProps,
                metaProps: metaProps
            };
        });
    }

    getContainerProperties(containerName, options) {
        return BbPromise.try(() => {
            const validationContext = new RootValidator()
                .run(ContainerExistsVal, {
                    containerName: containerName,
                    collection: this.db.getCollection(StorageTables.Containers)
                });
            const res = this._getCollectionAndContainer(containerName),
                httpProps = res.container.httpProps,
                metaProps = res.container.metaProps;

            res.container.leaseState = this._updateLeaseState(res.container.leaseState, res.container.leaseExpiredAt, res.container.leaseBrokenAt);
            validationContext.run(ContainerLeaseUsageValidation, {
                container: res.container,
                leaseId: options.leaseId,
                usage: 'other'
            });

            httpProps.ETag = res.container.meta.revision;
            if (res.container.access !== 'private') {
                httpProps['x-ms-blob-public-access'] = res.container.access;
            }
            return {
                httpProps: httpProps,
                metaProps: metaProps,
                container: res.container
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
                .run(PageBlobHeaderSanityVal)
                .run(BlobLeaseUsageValidation, {
                    usage: 'write',
                    leaseId: blob.httpProps['x-ms-lease-id'],
                    blob: this.db.getCollection(containerName).chain().find({ 'name': { '$eq': blob.name } }).data()[0]
                });

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
                writeStream = fs.createWriteStream(utils.escapeBlobDelimiter(blobPath), {
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
                .run(PageAlignmentVal)
                .run(BlobLeaseUsageValidation, {
                    usage: 'read',
                    leaseId: blob.httpProps['x-ms-lease-id'],
                    blob: this.db.getCollection(containerName).chain().find({ 'name': { '$eq': blob.name } }).data()[0]
                });

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
                size: res.blob.size
            };
        });
    }

    setContainerAcl(containerRequest, signedIdentifiers, options) {
        return BbPromise.try(() => {
            const validationContext = new RootValidator({
                containerName: containerRequest.name,
                collection: this.db.getCollection(StorageTables.Containers),
                model: signedIdentifiers
            })
                .run(ContainerExistsVal)
                .run(NumOfSignedIdentifiersVal);

            const res = this._getCollectionAndContainer(containerRequest.name),
                coll = res.coll,
                container = res.container;

            container.leaseState = this._updateLeaseState(container.leaseState, container.leaseExpiredAt, container.leaseBrokenAt);
            validationContext.run(ContainerLeaseUsageValidation, {
                container: container,
                leaseId: containerRequest.httpProps['x-ms-lease-id'],
                usage: 'other'
            });

            container.httpProps = containerRequest.httpProps;
            container.signedIdentifiers = signedIdentifiers;
            container.access = containerRequest.access;
            coll.update(container);
            return {
                ETag: container.meta.revision,
                'Last-Modified': container.httpProps['Last-Modified']
            }
        });
    }

    getContainerAcl(containerName, options) {
        return BbPromise.try(() => {
            const validationContext = new RootValidator({
                containerName: containerName,
                collection: this.db.getCollection(StorageTables.Containers)
            })
                .run(ContainerExistsVal);

            const res = this._getCollectionAndContainer(containerName),
                container = res.container;

            container.leaseState = this._updateLeaseState(res.container.leaseState, res.container.leaseExpiredAt, res.container.leaseBrokenAt);
            validationContext.run(ContainerLeaseUsageValidation, {
                container: container,
                leaseId: options.leaseId,
                usage: 'other'
            });

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
            const snapshotDate = SnapshotTimeManager.getDate(containerName, requestBlob.name);
            snapshotBlob.setSnapshotDate(snapshotDate.toUTCString());
            snapshotBlob.name = snapshotBlob.publicName();
            snapshotBlob.origin = updateBlob.name;
            if (Object.keys(requestBlob.metaProps).length > 0) {
                snapshotBlob.metaProps = requestBlob.metaProps;
                snapshotBlob.httpProps.ETag += 1;
                snapshotBlob.httpProps['Last-Modified'] = requestBlob.httpProps['Last-Modified'];
            }
            coll.insert(snapshotBlob);

            const destPath = path.join(env.snapshotPath, containerName, snapshotBlob.name);
            return fs.ensureDirAsync(path.join(env.snapshotPath, containerName))
                .then(() => {
                    return fs.copyAsync(env.diskStorageUri(containerName, requestBlob), destPath);
                })
                .then(() => {
                    return {
                        httpProps: snapshotBlob.httpProps,
                        'x-ms-snapshot': snapshotBlob.snapshotDate
                    }
                });
        });
    }

    leaseContainer(containerRequest) {
        return BbPromise.try(() => {
            const leaseAction = containerRequest.httpProps['x-ms-lease-action'],
                proposedLeaseId = containerRequest.httpProps['x-ms-proposed-lease-id'],
                leaseId = containerRequest.httpProps['x-ms-lease-id'],
                leaseBreakPeriod = (containerRequest.httpProps['x-ms-lease-break-period']) ? parseInt(containerRequest.httpProps['x-ms-lease-break-period']) : undefined,
                leaseDuration = (containerRequest.httpProps['x-ms-lease-duration']) ? parseInt(containerRequest.httpProps['x-ms-lease-duration']) : undefined;

            const coll = this.db.getCollection(StorageTables.Containers);
            const validationContext = new RootValidator({
                collection: coll,
                containerName: containerRequest.name,
                leaseAction: leaseAction,
                leaseId: leaseId,
                proposedLeaseId: proposedLeaseId,
                leaseBreakPeriod: leaseBreakPeriod,
                leaseDuration: leaseDuration
            })
                .run(ContainerExistsVal);

            const container = coll.chain().find({ 'name': { '$eq': containerRequest.name } }).data()[0];
            container.leaseState = this._updateLeaseState(container.leaseState, container.leaseExpiredAt, container.leaseBrokenAt)

            validationContext.run(LeaseActionsValidation, {
                storageItem: container
            })
                .run(LeaseDurationValidation)
                .run(LeaseIdValidation);

            const result = { props: {} };
            const now = Date.now();
            switch (leaseAction) {
                case 'acquire':
                    container.leaseId = proposedLeaseId || uuidv4();
                    container.leaseExpiredAt = (leaseDuration === -1) ? -1 : now + leaseDuration * 1000;
                    container.leaseDuration = leaseDuration;
                    container.leaseState = 'leased';
                    result.statusCode = 201;
                    break;
                case 'renew':
                    container.leaseExpiredAt = (container.leaseDuration === -1) ? -1 : now + container.leaseDuration * 1000;
                    result.statusCode = 200;
                    break;
                case 'change':
                    container.leaseId = proposedLeaseId;
                    result.statusCode = 200;
                    break;
                case 'release':
                    container.leaseState = 'available';
                    result.statusCode = 200;
                    break;
                case 'break':
                    if (leaseBreakPeriod === undefined) {
                        container.leaseBrokenAt = (container.leaseExpiredAt === -1) ? now : container.leaseExpiredAt;
                    } else if (container.leaseExpiredAt === -1) {
                        container.leaseBrokenAt = now + leaseBreakPeriod * 1000;
                    } else {
                        const span = container.leaseExpiredAt - now;
                        container.leaseBrokenAt = (span > leaseBreakPeriod * 1000)
                            ? container.leaseBrokenAt = now + leaseBreakPeriod * 1000
                            : container.leaseBrokenAt = container.leaseExpiredAt;
                    }
                    container.leaseState = 'breaking';
                    const leaseTimeRemaining = Math.floor((container.leaseBrokenAt - now) / 1000);
                    result.props['x-ms-lease-time'] = (leaseTimeRemaining > 0) ? leaseTimeRemaining : 0;
                    result.statusCode = 202;
                    break;
                default:
                    // This should never happen due to preceding validation!
                    throw new Error(`leaseContainer: Invalid Lease Action "${leaseAction}"`);
            }
            result.props['x-ms-lease-id'] = container.leaseId;
            result.props.ETag = container.meta.revision;
            result.props['Last-Modified'] = container.httpProps['Last-Modified'];
            return result;
        });
    }

    leaseBlob(containerName, blobRequest) {
        return BbPromise.try(() => {
            const leaseAction = blobRequest.httpProps['x-ms-lease-action'],
                proposedLeaseId = blobRequest.httpProps['x-ms-proposed-lease-id'],
                leaseId = blobRequest.httpProps['x-ms-lease-id'],
                leaseBreakPeriod = (blobRequest.httpProps['x-ms-lease-break-period']) ? parseInt(blobRequest.httpProps['x-ms-lease-break-period']) : undefined,
                leaseDuration = (blobRequest.httpProps['x-ms-lease-duration']) ? parseInt(blobRequest.httpProps['x-ms-lease-duration']) : undefined;

            const validationContext = new RootValidator({
                leaseAction: leaseAction,
                leaseId: leaseId,
                proposedLeaseId: proposedLeaseId,
                leaseBreakPeriod: leaseBreakPeriod,
                leaseDuration: leaseDuration
            })
                .run(ContainerExistsVal, {
                    collection: this.db.getCollection(StorageTables.Containers),
                    containerName: containerName,
                })
                .run(BlobExistsVal, {
                    collection: this.db.getCollection(containerName),
                    requestBlob: blobRequest
                })
                .run(LeaseDurationValidation)
                .run(LeaseIdValidation);

            const blob = this.db.getCollection(containerName).chain().find({ 'name': { '$eq': blobRequest.name } }).data()[0];
            blob.leaseState = this._updateLeaseState(blob.leaseState, blob.leaseExpiredAt, blob.leaseBrokenAt)

            validationContext.run(LeaseActionsValidation, {
                storageItem: blob
            });

            const result = { props: {} };
            const now = Date.now();
            switch (leaseAction) {
                case 'acquire':
                    blob.leaseId = proposedLeaseId || uuidv4();
                    blob.leaseExpiredAt = (leaseDuration === -1) ? -1 : now + leaseDuration * 1000;
                    blob.leaseDuration = leaseDuration;
                    blob.leaseState = 'leased';
                    blob.leaseETag = blob.httpProps.ETag;
                    result.statusCode = 201;
                    break;
                case 'renew':
                    blob.leaseExpiredAt = (blob.leaseDuration === -1) ? -1 : now + blob.leaseDuration * 1000;
                    result.statusCode = 200;
                    break;
                case 'change':
                    blob.leaseId = proposedLeaseId;
                    result.statusCode = 200;
                    break;
                case 'release':
                    blob.leaseState = 'available';
                    result.statusCode = 200;
                    break;
                case 'break':
                    if (leaseBreakPeriod === undefined) {
                        blob.leaseBrokenAt = (blob.leaseExpiredAt === -1) ? now : blob.leaseExpiredAt;
                    } else if (blob.leaseExpiredAt === -1) {
                        blob.leaseBrokenAt = now + leaseBreakPeriod * 1000;
                    } else {
                        const span = blob.leaseExpiredAt - now;
                        blob.leaseBrokenAt = (span > leaseBreakPeriod * 1000)
                            ? blob.leaseBrokenAt = now + leaseBreakPeriod * 1000
                            : blob.leaseBrokenAt = blob.leaseExpiredAt;
                    }
                    blob.leaseState = 'breaking';
                    const leaseTimeRemaining = Math.floor((blob.leaseBrokenAt - now) / 1000);
                    result.props['x-ms-lease-time'] = (leaseTimeRemaining > 0) ? leaseTimeRemaining : 0;
                    result.statusCode = 202;
                    break;
                default:
                    // This should never happen due to preceding validation!
                    throw new Error(`leaseContainer: Invalid Lease Action "${leaseAction}"`);
            }
            result.props['x-ms-lease-id'] = blob.leaseId;
            result.props.ETag = blob.meta.revision;
            result.props['Last-Modified'] = blob.httpProps['Last-Modified'];
            return result;
        });
    }

    _updateLeaseState(leaseState, leaseExpiredAt, leaseBrokenAt) {
        const now = Date.now();
        switch (leaseState) {
            // Has breaking period expired?
            case 'breaking':
                return (leaseBrokenAt <= now) ? 'broken' : 'breaking';
            // Has lease expired?
            case 'leased':
                // Infinite Lease
                if (leaseExpiredAt === -1) {
                    return 'leased';
                }
                return (leaseExpiredAt <= now) ? 'expired' : 'leased';
            default:
                return leaseState || 'available';
        }
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
}

module.exports = new StorageManager;