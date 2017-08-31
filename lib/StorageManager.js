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
    LeaseActions = require('./Constants').LeaseActions,
    LeaseStatus = require('./Constants').LeaseStatus,
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
    ValidationContext = require('./validation/ValidationContext'),
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
        const coll = this.db.getCollection(request.containerName),
            blobProxy = this._createOrUpdateBlob(coll, request, request.blobName);
        return fs.outputFileAsync(env.diskStorageUri(request), request.body, { encoding: request.httpProps[N.CONTENT_ENCODING] })
            .then(() => {
                return new AzuriteResponse({ proxy: blobProxy });
            });
    }

    putAppendBlock(request) {
        const { coll, blobProxy } = this._getCollectionAndBlob(request.containerName, request.blobName);
        blobProxy.original[N.BLOB_COMMITTED_BLOCK_COUNT] += 1;
        blobProxy.original.size += request.body.length;
        coll.update(blobProxy.release());
        return fs.appendFileAsync(env.diskStorageUri(request), request.body, { encoding: request.httpProps[N.CONTENT_ENCODING] })
            .then(() => {
                return new AzuriteResponse({ proxy: blobProxy });
            });
    }

    deleteBlob(request) {
        const coll = this.db.getCollection(request.containerName),
            snapshoteDeleteQueryParam = request.httpProps[N.DELETE_SNAPSHOTS];
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
                .then(() => {
                    return new AzuriteResponse();
                });
        }
    }

    getBlob(request) {
        const coll = this.db.getCollection(request.containerName);
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
        const coll = this.db.getCollection(request.containerName);
        const blobs = coll.chain()
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
        // We only create the blob in DB if it does not already exists.
        const { blobProxy } = this._getCollectionAndBlob(request.containerName, request.blobName);
        if (blobProxy === undefined) {
            const containerColl = this.db.getCollection(request.containerName);
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

    putBlockList(request) {
        let blockPaths = [];
        for (const block of request.azuritePayload) {
            // FIXME: This should be refactored since it is defined 4 times (here, validation.js StorageEntityGenerator, AzureBlobRequest) 
            const blockName = `${request.containerName}-${request.blobName}-${block.id}`;
            blockPaths.push(path.join(env.commitsPath, blockName));
        }
        
        // Updating properties of blob
        const coll = this.db.getCollection(request.containerName);
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
        const query = this._buildBlockListQuery(request.containerName, request.blobName, request.blockListType);
        const blocks = this.db.getCollection(StorageTables.Commits)
            .chain()
            .find(query)
            .data();

        const { blobProxy } = this._getCollectionAndBlob(request.containerName, request.blobName);
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

    getContainerAcl(request) {
        const validationContext = new RootValidator({
            containerName: containerName,
            collection: this.db.getCollection(StorageTables.Containers)
        })
            .run(ContainerExistsVal);

        const { containerProxy } = this._getCollectionAndContainer(request.containerName);
        containerProxy.updateLeaseState();

        validationContext.run(ContainerLeaseUsageValidation, {
            container: container,
            leaseId: options.leaseId,
            usage: 'other'
        });

        const response = new AzuriteResponse({ proxy: containerProxy });
        return BbPromise.resolve(response);
    }

    snapshotBlob(request) {
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

        const { coll, blobProxy } = this._getCollectionAndBlob(request.containerName, request.blobName);
        blobProxy.updateLeaseState();
        // updateBlob.leaseState = this._updateLeaseState(updateBlob.leaseState, updateBlob.leaseExpiredAt, updateBlob.leaseBrokenAt);
        validationContext.run(BlobLeaseUsageValidation, {
            usage: 'read',
            leaseId: requestBlob.httpProps['x-ms-lease-id'],
            blob: updateBlob
        });

        const snapshotBlobProxy = new BlobProxy(blobProxy.original);
        snapshotBlobProxy.original.snapshot = true;
        const snapshotDate = SnapshotTimeManager.getDate(request.containerName, request.blobName);
        snapshotBlobProxy.original.snapshotDate = snapshotDate.toUTCString();
        snapshotBlobProxy.original.name = snapshotBlobProxy.publicName();
        snapshotBlobProxy.original.origin = request.blobName;

        if (Object.keys(request.metaProps).length > 0) {
            snapshotBlobProxy.original.metaProps = request.metaProps;
        }
        coll.insert(snapshotBlobProxy.release());
        const destPath = path.join(env.snapshotPath, snapshotBlobProxy.containerName, snapshotBlobProxy.original.name);
        return fs.ensureDirAsync(path.join(env.snapshotPath, snapshotBlobProxy.containerName))
            .then(() => {
                return fs.copyAsync(env.diskStorageUri(request), destPath);
            })
            .then(() => {
                const response = new AzuriteResponse({ proxy: snapshotBlobProxy });
                return response;
            });
    }

    // RESUME HERE
    leaseContainer(request) {
        const leaseAction = request.httpProps[N.LEASE_ACTION],
            proposedLeaseId = request.httpProps[N.PROPOSED_LEASE_ID],
            leaseId = request.httpProps[N.LEASE_ID],
            leaseBreakPeriod = (request.httpProps[N.LEASE_BREAK_PERIOD]) ? parseInt(request.httpProps[N.LEASE_BREAK_PERIOD]) : undefined,
            leaseDuration = (request.httpProps[N.LEASE_DURATION]) ? parseInt(request.httpProps[N.LEASE_DURATION]) : undefined;

        const collCon = this.db.getCollection(StorageTables.Containers);
        const validationContext = new RootValidator({
            collection: collCon,
            containerName: request.containerName,
            leaseAction: leaseAction,
            leaseId: leaseId,
            proposedLeaseId: proposedLeaseId,
            leaseBreakPeriod: leaseBreakPeriod,
            leaseDuration: leaseDuration
        })
            .run(ContainerExistsVal);

        const { coll, containerProxy } = this._getCollectionAndContainer(request.containerName);
        // const container = coll.chain().find({ 'name': { '$eq': request.containerName } }).data()[0];
        // container.leaseState = this._updateLeaseState(container.leaseState, container.leaseExpiredAt, container.leaseBrokenAt)
        containerProxy.updateLeaseState();

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

        // Refactor me: current timestamp should be passed through request object and set by dedicated middleware module
        const now = Date.now();
        switch (leaseAction) {
            case LeaseActions.ACQUIRE:
                containerProxy.original.leaseId = proposedLeaseId || uuidv4();
                containerProxy.original.leaseExpiredAt = (leaseDuration === -1) ? -1 : now + leaseDuration * 1000;
                containerProxy.original.leaseDuration = leaseDuration;
                containerProxy.orginal.leaseState = LeaseStatus.LEASED;
                break;
            case LeaseActions.RENEW:
                containerProxy.orginal.leaseExpiredAt = (containerProxy.orginal.leaseDuration === -1) ? -1 : now + containerProxy.orginal.leaseDuration * 1000;
                break;
            case LeaseActions.CHANGE:
                containerProxy.orginal.leaseId = proposedLeaseId;
                break;
            case LeaseActions.RELEASE:
                containerProxy.orginal.leaseState = LeaseStatus.AVAILABLE;
                break;
            case LeaseActions.BREAK:
                if (leaseBreakPeriod === undefined) {
                    containerProxy.orginal.leaseBrokenAt = (containerProxy.orginal.leaseExpiredAt === -1) ? now : containerProxy.orginal.leaseExpiredAt;
                } else if (containerProxy.orginal.leaseExpiredAt === -1) {
                    containerProxy.orginal.leaseBrokenAt = now + leaseBreakPeriod * 1000;
                } else {
                    const span = containerProxy.orginal.leaseExpiredAt - now;
                    containerProxy.orginal.leaseBrokenAt = (span > leaseBreakPeriod * 1000)
                        ? containerProxy.orginal.leaseBrokenAt = now + leaseBreakPeriod * 1000
                        : containerProxy.orginal.leaseBrokenAt = containerProxy.orginal.leaseExpiredAt;
                }
                containerProxy.orginal.leaseState = LeaseStatus.BREAKING;
                break;
            default:
                // This should never happen due to preceding validation!
                throw new Error(`*INTERNAL ERROR*: leaseContainer: Invalid Lease Action "${leaseAction}"`);
        }
        coll.update(containerProxy.release());
        const response = new AzuriteResponse({ proxy: containerProxy });
        return BbPromise.resolve(response);
    }

    leaseBlob(request) {
        const leaseAction = request.httpProps[N.LEASE_ACTION],
            proposedLeaseId = request.httpProps[N.PROPOSED_LEASE_ID],
            leaseId = request.httpProps[N.LEASE_ID],
            leaseBreakPeriod = (request.httpProps[N.LEASE_BREAK_PERIOD]) ? parseInt(request.httpProps[N.LEASE_BREAK_PERIOD]) : undefined,
            leaseDuration = (request.httpProps[N.LEASE_DURATION]) ? parseInt(request.httpProps[N.LEASE_DURATION]) : undefined;

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

        const { coll, blobProxy } = this._getCollectionAndBlob(request.containerName, request.blobName);
        blobProxy.updateLeaseState();
        // const blob = this.db.getCollection(containerName).chain().find({ 'name': { '$eq': blobRequest.name } }).data()[0];
        // blob.leaseState = this._updateLeaseState(blob.leaseState, blob.leaseExpiredAt, blob.leaseBrokenAt)

        validationContext.run(LeaseActionsValidation, {
            storageItem: blob
        });

        // Refactor me: current timestamp should be passed through request object and set by dedicated middleware module
        const now = Date.now();
        switch (leaseAction) {
            case LeaseActions.ACQUIRE:
                blobProxy.original.leaseId = proposedLeaseId || uuidv4();
                blobProxy.original.leaseExpiredAt = (leaseDuration === -1) ? -1 : now + leaseDuration * 1000;
                blobProxy.original.leaseDuration = leaseDuration;
                blobProxy.original.leaseState = LeaseStatus.LEASED;
                blobProxy.original.leaseETag = blobProxy.original.httpProps.ETag;
                break;
            case LeaseActions.RENEW:
                blobProxy.original.leaseExpiredAt = (blobProxy.original.leaseDuration === -1) ? -1 : now + blobProxy.original.leaseDuration * 1000;
                break;
            case LeaseActions.CHANGE:
                blobProxy.original.leaseId = proposedLeaseId;
                break;
            case LeaseActions.RELEASE:
                blobProxy.original.leaseState = LeaseStatus.AVAILABLE;
                break;
            case LeaseActions.BREAK:
                if (leaseBreakPeriod === undefined) {
                    blobProxy.original.leaseBrokenAt = (blobProxy.original.leaseExpiredAt === -1) ? now : blobProxy.original.leaseExpiredAt;
                } else if (blobProxy.original.leaseExpiredAt === -1) {
                    blobProxy.original.leaseBrokenAt = now + leaseBreakPeriod * 1000;
                } else {
                    const span = blobProxy.original.leaseExpiredAt - now;
                    blobProxy.original.leaseBrokenAt = (span > leaseBreakPeriod * 1000)
                        ? blobProxy.original.leaseBrokenAt = now + leaseBreakPeriod * 1000
                        : blobProxy.original.leaseBrokenAt = blobProxy.original.leaseExpiredAt;
                }
                blobProxy.original.leaseState = LeaseStatus.BREAKING;
                break;
            default:
                // This should never happen due to preceding validation!
                throw new Error(`leaseContainer: Invalid Lease Action "${leaseAction}"`);
        }
        coll.update(blobProxy.release());
        const response = new AzuriteResponse({ proxy: blobProxy });
        return BbPromise.resolve(response);
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
        if (!coll) {
            return {
                coll: undefined,
                blobProxy: undefined
            };
        }
        const result = coll.chain()
            .find({ name: blobName })
            .data();
        if (result.length === 0) {
            return {
                coll: coll,
                blobProxy: undefined
            };
        }
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
        if (result.length === 0) {
            return {
                coll: coll,
                containerProxy: undefined
            };
        }
        return {
            coll: coll,
            containerProxy: new ContainerProxy(result[0])
        };
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