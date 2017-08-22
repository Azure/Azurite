'use strict';

const env = require('./env'),
    utils = require('./utils'),
    path = require('path'),
    BbPromise = require('bluebird'),
    Loki = require('lokijs'),
    fs = BbPromise.promisifyAll(require("fs-extra")),
    crypto = require('crypto'),
    StorageTables = require('./Constants').StorageTables,
    StorageEntityType = require('./Constants').StorageEntityType,
    StorageEntityGenerator = require('./model/StorageEntityGenerator'),
    CombinedStream = require('combined-stream'),
    ContainerProxy = require('./model/ContainerProxy'),
    N = require('./model/HttpHeaderNames'),
    ContainerRequest = require('./model/AzuriteContainerRequest'),
    AzuriteResponse = require('./model/AzuriteResponse'),
    BlobRequest = require('./model/AzuriteBlobRequest'),
    SnapshotTimeManager = require('./SnapshotTimeManager'),
    uuidv4 = require('uuid/v4'),
    // Validation
    RootValidator = require('./validation/RootValidator'),
    AppendMaxBlobCommittedBlocksVal = require('./validation/AppendMaxBlobCommittedBlocks'),
    BlobCreationSizeVal = require('./validation/BlobCreationSize'),
    BlockPageSizeVal = require('./validation/BlockPageSize'),
    SupportedBlobTypeVal = require('./validation/SupportedBlobType'),
    CompatibleBlobTypeVal = require('./validation/CompatibleBlobType'),
    MD5Val = require('./validation/MD5'),
    ConflictingItemVal = require('./validation/ConflictingItem'),
    ContentLengthExistsVal = require('./validation/ContentLengthExists'),
    ContainerExistsVal = require('./validation/ContainerExists'),
    BlobExistsVal = require('./validation/BlobExists'),
    BlobCommittedVal = require('./validation/BlobCommitted'),
    IsOfBlobTypeVal = require('./validation/IsOfBlobType'),
    RangeVal = require('./validation/Range'),
    PageAlignmentVal = require('./validation/PageAlignment'),
    NumOfSignedIdentifiersVal = require('./validation/NumOfSignedIdentifiers'),
    PutBlobHeaderVal = require('./validation/PutBlobHeaders'),
    ConditionalRequestHeadersVal = require('./validation/ConditionalRequestHeaders'),
    AppendBlobConditionalRequestHeadersVal = require('./validation/AppendBlobConditionalRequestHeaders'),
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

    createContainer(request) {
        new RootValidator({
            collection: this.db.getCollection(StorageTables.Containers),
            request: request
        })
            .run(ConflictingItemVal);

        const coll = this.db.getCollection(StorageTables.Containers);
        const entity = StorageEntityGenerator.generateStorageEntity(request);
        const containerProxy = new ContainerProxy(coll.insert(entity));
        this.db.addCollection(entity.name);
        return fs.mkdirAsync(request.fullPath())
            .then(() => {
                return new AzuriteResponse({ proxy: containerProxy });
            });
    }

    deleteContainer(request) {
        new RootValidator({
            collection: this.db.getCollection(StorageTables.Containers),
            request: request
        })
            .run(ContainerExistsVal)
            .run(ContainerLeaseUsageValidation);

        const coll = this.db.getCollection(StorageTables.Containers);
        coll.chain().find({ 'name': { '$eq': request.containerName } }).remove();
        this.db.removeCollection(request.containerName);
        // TODO: Remove Blocks in Committed Directory and Committed Blocks in DB
        return fs.remove(request.fullPath())
            .then(() => {
                return new AzuriteResponse();
            });
    }

    listContainer(prefix, maxresults) {
        maxresults = parseInt(maxresults);
        let tables = this.db.getCollection(StorageTables.Containers);
        let result = tables.chain()
            .find({ 'name': { '$contains': prefix } })
            .simplesort('name')
            .limit(maxresults)
            .data();
        return BbPromise.resolve(new AzuriteResponse({ payload: result }));
    }

    putBlob(request) {
        let coll = this.db.getCollection(request.containerName);
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
            }, blobResult.length === 0) // skip if blob has not been created yet
            .run(ConditionalRequestHeadersVal, {
                requestBlob: blob,
                updateItem: (blobResult.length === 0) ? undefined : blobResult[0],
                operationType: 'write'
            });

        const blobProxy = this._createOrUpdateBlob(coll, request, request.blobName);
        return fs.outputFileAsync(env.diskStorageUri(request), body, { encoding: request.httpProps[N.CONTENT_ENCODING] })
            .then(() => {
                return new AzuriteResponse({ proxy: blobProxy });
            });
    }

    putAppendBlock(request) {
        const { coll, blobProxy } = this._getCollectionAndBlob(request.containerName, request.blobName);
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
            .run(AppendMaxBlobCommittedBlocksVal)
            .run(CompatibleBlobTypeVal, {
                updateBlob: updateBlob,
                requestBlob: blob,
            })
            .run(BlobLeaseUsageValidation, {
                usage: 'write',
                leaseId: blob.httpProps['x-ms-lease-id'],
                blob: updateBlob
            })
            .run(ConditionalRequestHeadersVal, {
                updateItem: updateBlob,
                operationType: 'write'
            })
            .run(AppendBlobConditionalRequestHeadersVal, {
                updateItem: updateBlob,
                bodySize: body.length
            });

        blobProxy.original['x-ms-blob-committed-block-count'] += 1;
        blobProxy.original.size += request.body.length;
        coll.update(blobProxy.release());
        return fs.appendFileAsync(env.diskStorageUri(request), body, { encoding: request.httpProps[N.CONTENT_ENCODING] })
            .then(() => {
                return new AzuriteResponse({ proxy: blobProxy });
            });
    }

    deleteBlob(request) {
        let coll = this.db.getCollection(request.containerName);
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
            })
            .run(ConditionalRequestHeadersVal, {
                updateItem: coll.chain().find({ 'name': { '$eq': blob.name } }).data()[0],
                operationType: 'write'
            });

        const snapshoteDeleteQueryParam = request.httpProps[N.DELETE_SNAPSHOTS];
        // Fixme: We are currently not deleting snapshot files from disk (need to refactor env.diskStorageUri to support wildcard expr). 
        // Since source of truth is in-memory DB this does not matter from a client's perspective, though.
        if (snapshoteDeleteQueryParam === 'include') {
            coll.chain().find({ 'name': { '$eq': request.blobName } }).remove();
            coll.chain().find({ 'origin': { '$eq': request.blobName } }).remove();
            return fs.removeAsync(env.diskStorageUri(request))
                .then(() => {
                    return new AzuriteResponse();
                });
        } else if (snapshoteDeleteQueryParam === 'only') {
            coll.chain().find({ 'origin': { '$eq': request.blobName } }).remove();
            return BbPromise.resolve(new AzuriteResponse());
        } else {
            coll.chain().find({ 'name': { '$eq': request.blobName } }).remove();
            return fs.removeAsync(env.diskStorageUri(request))
                .then(new AzuriteResponse());
        }
    }

    getBlob(request) {
        const coll = this.db.getCollection(request.containerName);
        new RootValidator({
            requestBlob: requestBlob,
            collection: coll
        })
            .run(BlobExistsVal)
            .run(BlobCommittedVal)
            .run(RangeVal)
            .run(BlobLeaseUsageValidation, {
                usage: 'read',
                leaseId: requestBlob.httpProps['x-ms-lease-id'],
                blob: coll.chain().find({ 'name': { '$eq': request.publicName() } }).data()[0]
            })
            .run(ConditionalRequestHeadersVal, {
                updateItem: coll.chain().find({ 'name': { '$eq': request.publicName() } }).data()[0],
                operationType: 'read'
            });

        const blob = coll.chain()
            .find({
                '$and': [
                    {
                        'name': { '$eq': request.publicName() }
                    },
                    {
                        'snapshot': { '$eq': request.isSnapshot() }
                    }
                ]
            })
            .data()[0];

        const response = new AzuriteResponse({ proxy: new BlobProxy(blob, request.containerName) });
        return BbPromise.resolve(response);
    }

    listBlobs(request) {
        const coll = this.db.getCollection(request.containerName);
        new RootValidator({
            containerName: containerName,
            collection: this.db.getCollection(StorageTables.Containers)
        })
            .run(ContainerExistsVal);

        const condition = [];
        condition.push({
            'name': { '$contains': request.query.prefix }
        });
        if (request.query.include !== 'snapshots') {
            condition.push({
                'snapshot': { '$eq': false }
            });
        }
        if (request.query.include !== 'uncommittedblobs') {
            condition.push({
                'committed': { '$eq': true }
            });
        }
        let blobs = coll.chain()
            .find({
                '$and': condition
            })
            .simplesort('name')
            .limit(request.query.maxresults);
        if (request.query.marker) {
            let offset = parseInt(request.query.marker);
            offset *= (request.query.maxresults || 1000);
            blobs.offset(offset);
        }
        const response = new AzuriteResponse({ payload: blobs.data() });
        return BbPromise.resolve(response);
    }

    putBlock(request) {
        let containerColl = this.db.getCollection(request.containerName);
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

        const parentBlobResult = containerColl.chain()
            .find({ 'name': { '$eq': request.blobName } })
            .data();

        validationContext
            .run(CompatibleBlobTypeVal, {
                updateBlob: (parentBlobResult.length === 0) ? undefined : parentBlobResult[0],
                requestBlob: options.blob,
            }, parentBlobResult.length === 0)
            .run(BlobLeaseUsageValidation, {
                usage: 'write',
                leaseId: options.blob.httpProps['x-ms-lease-id'],
                blob: (parentBlobResult.length === 0) ? undefined : parentBlobResult[0]
            }, parentBlobResult.length === 0); // skip if blob has not been created yet

        // We only create the blob in DB if it does not already exists.
        if (parentBlobResult.length === 0) {
            this._createOrUpdateBlob(containerColl, request, request.blobName);
        }

        // Storing block information in DB.
        const commitColl = this.db.getCollection(StorageTables.Commits);
        const blobProxy = this._createOrUpdateBlob(commitColl, request, request.blockName);
        // Make sure that the parent blob exists on storage.
        return fs.ensureFileAsync(env.diskStorageUri(request))
            .then(() => {
                // Writing block to disk.
                return fs.outputFileAsync(env.diskStorageUri(request), request.body, { encoding: request.httpProps[N.CONTENT_ENCODING] });
            })
            .then(() => {
                return new AzuriteResponse({ proxy: blobProxy });
            });
    }

    putBlockList(request, blockList) {
        let blockPaths = [];
        const validationContext = new RootValidator({
            collection: this.db.getCollection(StorageTables.Commits)
        });
        for (const block of blockList) {
            // FIXME: This should be refactored since it is defined 3 times (here, StorageEntityGenerator, AzureBlobRequest) 
            const blockName = `${request.containerName}-${request.blobName}-${block.id}`;
            blockPaths.push(path.join(env.commitsPath, blockName));
            validationContext.run(BlobExistsVal, {
                requestBlob: { publicName: () => { return blockName } }
            });
        }
        validationContext
            .run(ContainerExistsVal, {
                containerName: request.containerName,
                collection: this.db.getCollection(StorageTables.Containers)
            });

        // Updating properties of blob
        const coll = this.db.getCollection(containerName);
        const blobResult = coll.chain()
            .find({ 'name': { '$eq': request.blobName } })
            .data();

        validationContext
            .run(CompatibleBlobTypeVal, {
                updateBlob: (blobResult.length === 0) ? undefined : blobResult[0],
                requestBlob: blob,
            }, blobResult.length === 0)
            .run(BlobLeaseUsageValidation, {
                usage: 'write',
                leaseId: blob.httpProps['x-ms-lease-id'],
                blob: (blobResult.length === 0) ? undefined : blobResult[0]
            }, blobResult.length === 0) // Skip if blob has not been created yet
            .run(ConditionalRequestHeadersVal, {
                updateItem: (blobResult.length === 0) ? undefined : blobResult[0],
                requestBlob: blob,
                operationType: 'write'
            }, blobResult.length === 0); // Skip if blob has not been created yet

        const blobProxy = this._createOrUpdateBlob(coll, request, request.blobName);

        // Writing multiple blocks to one blob
        const combinedStream = CombinedStream.create();
        for (const blockName of blockPaths) {
            combinedStream.append(fs.createReadStream(blockName));
        }

        return new BbPromise((resolve, reject) => {
            const destinationStream = fs.createWriteStream(env.diskStorageUri(request));
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
                        .find({ parent: `${request.containerName}-${request.blobName}` })
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
                            blobProxy.original.size = totalSize;
                            coll.update(blobProxy.release());
                            resolve(new AzuriteResponse({ proxy: blobProxy }));
                        });
                });
            combinedStream.pipe(destinationStream);
        });
    }

    getBlockList(request) {
        const coll = this.db.getCollection(request.containerName)
        let requestBlob = coll ? this.db.getCollection(request.containerName).find({ name: request.blobName })[0] : null;
        if (requestBlob && requestBlob.length > 0) {
            requestBlob = requestBlob[0];
        }
        new RootValidator({
            requestBlob: requestBlob,
            collection: coll
        })
            .run(ContainerExistsVal, { containerName: containerName, collection: this.db.getCollection(StorageTables.Containers) })
            .run(BlobExistsVal, { requestBlob: blob })
            .run(SupportedBlobTypeVal)
            .run(IsOfBlobTypeVal, { blobType: BlobTypes.BlockBlob })
            .run(BlobLeaseUsageValidation, {
                usage: 'read',
                leaseId: request.httpProps['x-ms-lease-id'],
                blob: requestBlob
            });

        const query = this._buildBlockListQuery(request.containerName, request.blobName, request.blockListType);
        const blocks = this.db.getCollection(StorageTables.Commits)
            .chain()
            .find(query)
            .data();

        const blob = coll.find({ name: request.blobName });
        const blobProxy = new BlobProxy(blob, request.containerName);
        const response = new AzuriteResponse({ proxy: blobProxy, payload: blocks });
        return BbPromise.resolve(response);
    }

    setBlobMetadata(request) {
        const validationContext = new RootValidator()
            .run(ContainerExistsVal, {
                containerName: request.containerName,
                collection: this.db.getCollection(StorageTables.Containers)
            })
            .run(BlobExistsVal, {
                requestBlob: blob,
                collection: this.db.getCollection(request.containerName)
            })
            .run(ConditionalRequestHeadersVal, {
                requestBlob: blob,
                updateItem: this.db.getCollection(request.containerName).chain().find({ 'name': { '$eq': request.blobName } }).data()[0],
                operationType: 'write'
            });

        const { coll, blobProxy } = this._getCollectionAndBlob(containerName, blob.name);

        validationContext.run(BlobLeaseUsageValidation, {
            usage: 'write',
            leaseId: blob.httpProps['x-ms-lease-id'],
            blob: blobToUpdate
        });

        blobProxy.original.metaProps = request.metaProps;
        coll.update(blobProxy.release());
        const response = new AzuriteResponse({ proxy: blobProxy });
        return BbPromise.resolve(response);
    }

    getBlobMetadata(request) {
        const validationContext = new RootValidator()
            .run(ContainerExistsVal, {
                containerName: request.containerName,
                collection: this.db.getCollection(StorageTables.Containers)
            })
            .run(BlobExistsVal, {
                requestBlob: request.blobName,
                collection: this.db.getCollection(request.containerName)
            })
            .run(BlobCommittedVal, {
                requestBlob: requestBlob,
                collection: this.db.getCollection(containerName)
            });

        const { blobProxy } = this._getCollectionAndBlob(request.containerName, request.publicName());

        // This(validation) will all go into separate module / middleware
        blobProxy.updateLeaseState();
        validationContext
            .run(BlobLeaseUsageValidation, {
                usage: 'read',
                leaseId: requestBlob.httpProps['x-ms-lease-id'],
                blob: blob
            })
            .run(ConditionalRequestHeadersVal, {
                updateItem: blob,
                requestBlob: requestBlob,
                operationType: 'read'
            });

        const response = new AzuriteResponse({ proxy: blobProxy });
        return BbPromise.resolve(response);
    }

    setBlobProperties(request) {
        const validationContext = new RootValidator()
            .run(ContainerExistsVal, {
                containerName: containerName,
                collection: this.db.getCollection(StorageTables.Containers)
            })
            .run(BlobExistsVal, {
                requestBlob: blob,
                collection: this.db.getCollection(containerName)
            })
            .run(ConditionalRequestHeadersVal, {
                requestBlob: blob,
                updateItem: this.db.getCollection(containerName).chain().find({ 'name': { '$eq': blob.name } }).data()[0],
                operationType: 'write'
            });

        const { coll, blobProxy } = this._getCollectionAndBlob(containerName, blob.name);

        validationContext.run(BlobLeaseUsageValidation, {
            usage: 'write',
            leaseId: blob.httpProps['x-ms-lease-id'],
            blob: blobToUpdate
        });

        request.httpProps[N.CACHE_CONTROL] ? blobProxy.original.cacheControl = request.httpProps[N.CACHE_CONTROL] : delete blobProxy.original.cacheControl;
        request.httpProps[N.CONTENT_TYPE] ? blobProxy.original.contentType = request.httpProps[N.CONTENT_TYPE] : delete blobProxy.original.contentType;
        request.httpProps[N.CONTENT_ENCODING] ? blobProxy.original.contentEncoding = request.httpProps[N.CONTENT_ENCODING] : delete blobProxy.original.contentEncoding;
        request.httpProps[N.CONTENT_LANGUAGE] ? blobProxy.original.contentLanguage = request.httpProps[N.CONTENT_LANGUAGE] : delete blobProxy.original.CONTENT_LANGUAGE;
        coll.update(blobProxy.release());
        const response = new AzuriteResponse({ proxy: blobProxy });
        return BbPromise.resolve(response);
    }

    getBlobProperties(request) {
        // Same OP, different response headers are filtered and processeed at handler level
        return this.getBlobMetadata(request);
    }

    setContainerMetadata(request) {
        const validationContext = new RootValidator()
            .run(ContainerExistsVal, {
                containerName: request.containerName,
                collection: this.db.getCollection(StorageTables.Containers)
            });

        const { coll, containerProxy } = this._getCollectionAndContainer(request.containerName);

        containerProxy.updateLeaseState();

        validationContext
            .run(ContainerLeaseUsageValidation, {
                container: container,
                leaseId: containerRequest.httpProps['x-ms-lease-id'],
                usage: 'other'
            })
            .run(ConditionalRequestHeadersVal, {
                updateItem: container,
                requestBlob: containerRequest,
                operationType: 'write'
            });

        containerProxy.metaProps = request.metaProps;
        coll.update(containerProxy.release());
        const response = new AzuriteResponse({ proxy: containerProxy });
        return BbPromise.resolve(response);
    }

    getContainerMetadata(request) {
        const validationContext = new RootValidator()
            .run(ContainerExistsVal, {
                containerName: containerName,
                collection: this.db.getCollection(StorageTables.Containers)
            });
        const { containerProxy } = this._getCollectionAndContainer(request.containerName);

        containerProxy.updateLeaseState();

        validationContext.run(ContainerLeaseUsageValidation, {
            container: res.container,
            leaseId: options.leaseId,
            usage: 'other'
        });

        const response = new AzuriteResponse({ proxy: containerProxy });
        return BbPromise.resolve(response);
    }

    getContainerProperties(request) {
        const validationContext = new RootValidator()
            .run(ContainerExistsVal, {
                containerName: request.containerName,
                collection: this.db.getCollection(StorageTables.Containers)
            });

        const { containerProxy } = this._getCollectionAndContainer(containerName);

        containerProxy.updateLeaseState();
        validationContext.run(ContainerLeaseUsageValidation, {
            container: res.container,
            leaseId: options.leaseId,
            usage: 'other'
        });

        const response = new AzuriteResponse({ proxy: containerProxy });
        return BbPromise.resolve(response);
    }

    // RESUME HERE
    putPage(request) {
        new RootValidator({
            body: body,
            requestBlob: blob
        })
            .run(ContainerExistsVal, {
                containerName: request.containerName,
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
            .run(CompatibleBlobTypeVal, {
                updateBlob: this.db.getCollection(containerName).chain().find({ 'name': { '$eq': blob.name } }).data()[0],
                requestBlob: blob,
            })
            .run(BlobLeaseUsageValidation, {
                usage: 'write',
                leaseId: blob.httpProps['x-ms-lease-id'],
                blob: this.db.getCollection(containerName).chain().find({ 'name': { '$eq': blob.name } }).data()[0]
            })
            .run(ConditionalRequestHeadersVal, {
                updateItem: this.db.getCollection(containerName).chain().find({ 'name': { '$eq': blob.name } }).data()[0],
                requestBlob: blob,
                operationType: 'write'
            });

        const parts = request.httpProps[N.RANGE].split('=')[1].split('-'),
            startByte = parseInt(parts[0]),
            endByte = parseInt(parts[1]);
        // Getting overlapping pages (sorted by startByte in ascending order)
        const collPages = this.db.getCollection(StorageTables.Pages);
        const pageRanges = collPages.chain()
            .find({
                '$and': [
                    { 'end': { '$gte': startByte / 512 } },
                    { 'start': { '$lte': (endByte + 1) / 512 } },
                    { 'name': { '$eq': `${request.containerName}-${request.blobName}` } }]
            })
            .sort((a, b) => {
                return a.start - b.start;
            })
            .data();

        this._updatePageRanges(collPages, pageRanges, startByte, endByte, `${request.containerName}-${request.blobName}`);

        const pageWriteMode = request.httpProps[N.PAGE_WRITE],
            blobPath = path.join(env.localStoragePath, request.containerName, request.blobName),
            writeStream = fs.createWriteStream(utils.escapeBlobDelimiter(blobPath), {
                flags: 'r+',
                start: startByte,
                defaultEncoding: 'utf8'
            });

        let pageContent;
        if (pageWriteMode === 'UPDATE') {
            pageContent = request.body;
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
                    const { coll, blobProxy } = this._getCollectionAndBlob(request.containerName, request.blobName);
                    blobProxy.original.size = fs.statSync(blobPath).size;
                    blobProxy.original.sequenceNumber++;
                    coll.update(blobProxy.release());
                    const response = new AzuriteResponse({ proxy: blobProxy });
                    resolve(response);
                });
            writeStream.write(pageContent);
            writeStream.end();
        });
    }

    getPageRanges(request) {
        new RootValidator({
            requestBlob: blob
        })
            .run(ContainerExistsVal, {
                containerName: request.containerName,
                collection: this.db.getCollection(StorageTables.Containers)
            })
            .run(BlobExistsVal, {
                collection: this.db.getCollection(request.containerName)
            })
            .run(PageAlignmentVal)
            .run(BlobLeaseUsageValidation, {
                usage: 'read',
                leaseId: blob.httpProps['x-ms-lease-id'],
                blob: this.db.getCollection(containerName).chain().find({ 'name': { '$eq': blob.name } }).data()[0]
            })
            .run(ConditionalRequestHeadersVal, {
                updateItem: this.db.getCollection(containerName).chain().find({ 'name': { '$eq': blob.name } }).data()[0],
                operationType: 'write'
            });

        let pageRanges;
        const collPages = this.db.getCollection(StorageTables.Pages);
        if (request.httpProps[N.RANGE]) {
            // If range exists it is guaranteed to be well-formed due to PageAlignment validation
            const parts = request.httpProps[N.RANGE].split('=')[1].split('-'),
                startByte = parseInt(parts[0]),
                endByte = parseInt(parts[1]);
            pageRanges = collPages.chain()
                .find({
                    '$and': [
                        { 'end': { '$gte': startByte } },
                        { 'start': { '$lte': endByte } },
                        { 'name': { '$eq': `${request.containerName}-${request.blobName}` } }]
                })
                .sort((a, b) => {
                    return a.start - b.start;
                })
                .data();
        } else {
            pageRanges = collPages.chain()
                .find({ 'name': { '$eq': `${request.containerName}-${request.blobName}` } })
                .sort((a, b) => {
                    return a.start - b.start;
                })
                .data();
        }

        const { blobProxy } = this._getCollectionAndBlob(request.containerName, request.blobName);
        const response = new AzuriteResponse({ proxy: blobProxy, payload: pageRanges });
        return BbPromise.resolve(response);
    }

    setContainerAcl(request, signedIdentifiers) {
        const validationContext = new RootValidator({
            containerName: request.containerName,
            collection: this.db.getCollection(StorageTables.Containers),
            model: signedIdentifiers
        })
            .run(ContainerExistsVal)
            .run(NumOfSignedIdentifiersVal)
            .run(ConditionalRequestHeadersVal, {
                requestBlob: containerRequest,
                updateItem: this.db.getCollection(StorageTables.Containers).chain().find({ 'name': { '$eq': containerRequest.name } }).data()[0],
                operationType: 'write'
            });

        const { coll, containerProxy } = this._getCollectionAndContainer(request.containerName);
        containerProxy.updateLeaseState();
        validationContext.run(ContainerLeaseUsageValidation, {
            container: container,
            leaseId: containerRequest.httpProps['x-ms-lease-id'],
            usage: 'other'
        });

        containerProxy.original.signedIdentifiers = signedIdentifiers;
        containerProxy.original.access = request.httpProps[N.BLOB_PUBLIC_ACCESS];
        coll.update(container.release());
        const response = new AzuriteResponse({ proxy: containerProxy });
        return BbPromise.resolve(response);
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
                ETag: container.ETag,
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
            const validationContext = new RootValidator({
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
                    updateItem: this.db.getCollection(containerName).chain().find({ 'name': { '$eq': requestBlob.name } }).data()[0],
                    operationType: 'write'
                });

            const collAndBlob = this._getCollectionAndBlob(containerName, requestBlob.name),
                coll = collAndBlob.coll,
                updateBlob = collAndBlob.blob;

            updateBlob.leaseState = this._updateLeaseState(updateBlob.leaseState, updateBlob.leaseExpiredAt, updateBlob.leaseBrokenAt);
            validationContext.run(BlobLeaseUsageValidation, {
                usage: 'read',
                leaseId: requestBlob.httpProps['x-ms-lease-id'],
                blob: updateBlob
            });

            const snapshotBlob = Blob.clone(updateBlob);
            const snapshotDate = SnapshotTimeManager.getDate(containerName, requestBlob.name);
            snapshotBlob.setSnapshotDate(snapshotDate.toUTCString());
            snapshotBlob.name = snapshotBlob.publicName();
            snapshotBlob.origin = updateBlob.name;
            if (Object.keys(requestBlob.metaProps).length > 0) {
                snapshotBlob.metaProps = requestBlob.metaProps;
                snapshotBlob.ETag = uuidv4();
                snapshotBlob.httpProps['Last-Modified'] = requestBlob.httpProps['Last-Modified'];
            }
            coll.insert(snapshotBlob);
            snapshotBlob.httpProps.ETag = snapshotBlob.ETag;
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
                .run(LeaseIdValidation)
                .run(ConditionalRequestHeadersVal, {
                    requestBlob: containerRequest,
                    updateItem: container,
                    operationType: 'write'
                });

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
                    throw new Error(`*INTERNAL ERROR*: leaseContainer: Invalid Lease Action "${leaseAction}"`);
            }
            result.props['x-ms-lease-id'] = container.leaseId;
            result.props.ETag = container.ETag;
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
                .run(LeaseIdValidation)
                .run(ConditionalRequestHeadersVal, {
                    requestBlob: blobRequest,
                    updateItem: this.db.getCollection(containerName).chain().find({ 'name': { '$eq': blobRequest.name } }).data()[0],
                    operationType: 'write'
                })

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
            result.props.ETag = blob.ETag;
            result.props['Last-Modified'] = blob.httpProps['Last-Modified'];
            return result;
        });
    }

    _createOrUpdateBlob(coll, request, blobName) {
        const blob = coll.chain().find({ 'name': { '$eq': blobName } }).data();
        if (blob.length > 0) {
            coll.chain().find({ 'name': { '$eq': blobName } }).remove();
        }
        const entity = StorageEntityGenerator.generateStorageEntity(request);
        const blobProxy = new BlobProxy(coll.insert(entity), request.containerName);
        coll.update(blobProxy.release());
        return blobProxy;
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
            blobProxy: new BlobProxy(result[0], containerName)
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
            containerProxy: new ContainerProxy(result[0])
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