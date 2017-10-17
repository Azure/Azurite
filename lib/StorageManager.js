'use strict';

const env = require('./env'),
    utils = require('./utils'),
    path = require('path'),
    BbPromise = require('bluebird'),
    Loki = require('lokijs'),
    req = require('request'),
    fs = require("fs-extra"),
    fsn = BbPromise.promisifyAll(require("fs")),
    crypto = require('crypto'),
    StorageTables = require('./Constants').StorageTables,
    StorageEntityType = require('./Constants').StorageEntityType,
    LeaseActions = require('./Constants').LeaseActions,
    LeaseStatus = require('./Constants').LeaseStatus,
    CopyStatus = require('./Constants').CopyStatus,
    BlockListType = require('./Constants').BlockListType,
    StorageEntityGenerator = require('./model/StorageEntityGenerator'),
    AzuriteBlobRequest = require('./model/AzuriteBlobRequest'),
    CombinedStream = require('combined-stream'),
    ContainerProxy = require('./model/ContainerProxy'),
    BlobProxy = require('./model/BlobProxy'),
    N = require('./model/HttpHeaderNames'),
    ContainerRequest = require('./model/AzuriteContainerRequest'),
    AzuriteResponse = require('./model/AzuriteResponse'),
    BlobRequest = require('./model/AzuriteBlobRequest'),
    SnapshotTimeManager = require('./SnapshotTimeManager'),
    CopyOperationsManager = require('./CopyOperationsManager'),
    uuidv4 = require('uuid/v4');

class StorageManager {
    constructor() {
    }

    init(localStoragePath) {
        this.db = BbPromise.promisifyAll(new Loki(env.azuriteDBPath, { autosave: true, autosaveInterval: 5000 }));
        return fsn.statAsync(env.azuriteDBPath)
            .then((stat) => {
                return this.db.loadDatabaseAsync({});
            })
            .then((data) => {
                if (!this.db.getCollection(StorageTables.Containers)) {
                    this.db.addCollection(StorageTables.Containers);
                }
                return this.db.saveDatabaseAsync();
            })
            .catch((e) => {
                if (e.code === 'ENOENT') {
                    // No DB has been persisted / initialized yet.
                    this.db.addCollection(StorageTables.Containers);
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
        return BbPromise.resolve({ proxy: containerProxy });
    }

    deleteContainer(request) {
        const conColl = this.db.getCollection(StorageTables.Containers);
        conColl.chain().find({ 'name': { '$eq': request.containerName } }).remove();
        const entities = this.db.getCollection(request.containerName).chain()
            .find({ 'name': { '$contains': '' } }).data(); // get every entity in this collection
        const promises = [];

        for (const entity of entities) {
            promises.push(fs.remove(entity.uri));
        }
        return BbPromise.all(promises)
            .then(() => {
                this.db.removeCollection(request.containerName);
                return new AzuriteResponse({});
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
            blobProxy = this._createOrUpdateBlob(coll, request);
        this._clearCopyMetaData(blobProxy);
        return fs.outputFile(request.uri, request.body, { encoding: request.httpProps[N.CONTENT_ENCODING] })
            .then(() => {
                return new AzuriteResponse({ proxy: blobProxy });
            });
    }

    putAppendBlock(request) {
        const { coll, blobProxy } = this._getCollectionAndBlob(request.containerName, request.id);
        blobProxy.original[N.BLOB_COMMITTED_BLOCK_COUNT] += 1;
        blobProxy.original.size += request.body.length;
        coll.update(blobProxy.release());
        return fsn.appendFileAsync(request.uri, request.body, { encoding: request.httpProps[N.CONTENT_ENCODING] })
            .then(() => {
                return new AzuriteResponse({ proxy: blobProxy });
            });
    }

    deleteBlob(request) {
        const coll = this.db.getCollection(request.containerName),
            snapshoteDeleteQueryParam = request.httpProps[N.DELETE_SNAPSHOTS];
        let promises = [];

        if (snapshoteDeleteQueryParam === 'include' || snapshoteDeleteQueryParam === 'only') {
            const result = coll.chain().find({ 'originId': { '$eq': request.id } });
            for (const entity of result.data()) {
                promises.push(fs.remove(entity.uri));
            }
            result.remove();

            if (snapshoteDeleteQueryParam === 'include') {
                coll.chain().find({ 'id': { '$eq': request.id } }).remove();
                promises.push(fs.remove(request.uri));
            }
            return BbPromise.all(promises)
                .then(() => {
                    return new AzuriteResponse({});
                });
        } else {
            coll.chain().find({ 'id': { '$eq': request.id } }).remove();
            coll.chain().find({ 'parentId': { '$eq': request.id } }).remove(); // Removing (un-)committed blocks
            return fs.remove(request.uri)
                .then(() => {
                    return new AzuriteResponse({});
                });
        }
    }

    getBlob(request) {
        const coll = this.db.getCollection(request.containerName);
        const blob = coll.chain()
            .find({ 'id': { '$eq': request.id } })
            .data()[0];

        const response = new AzuriteResponse({ proxy: new BlobProxy(blob, request.containerName) });
        return BbPromise.resolve(response);
    }

    listBlobs(request, query) {
        const condition = [];
        condition.push({
            'name': { '$contains': query.prefix }
        });
        condition.push({
            'parentId': { '$eq': undefined } // blocks should never be part of the listing
        });

        if (query.include !== 'snapshots') {
            condition.push({
                'snapshot': { '$eq': false }
            });
        }
        if (query.include !== 'uncommittedblobs') {
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
            .limit(query.maxresults);
        if (query.marker) {
            let offset = parseInt(query.marker);
            offset *= (query.maxresults || 1000);
            blobs.offset(offset);
        }
        const response = new AzuriteResponse({ payload: BlobProxy.createFromArray(blobs.data(), request.containerName) });
        return BbPromise.resolve(response);
    }

    putBlock(request) {
        // We only create the parent blob in DB if it does not already exists.
        const { coll, blobProxy } = this._getCollectionAndBlob(request.containerName, request.parentId);
        if (blobProxy === undefined) {
            // If blockId is set we would generate a commit storage entity, thus we 
            // clone the original request and set blockId to undefined
            const parentBlobRequest = AzuriteBlobRequest.clone(request);
            parentBlobRequest.id = parentBlobRequest.parentId;
            parentBlobRequest.uri = env.diskStorageUri(parentBlobRequest.id);
            delete parentBlobRequest.parentId;
            delete parentBlobRequest.blockId;
            parentBlobRequest.commit = false;
            parentBlobRequest.body = undefined;
            this._createOrUpdateBlob(coll, parentBlobRequest);
        }
        // Storing block information in DB.
        const blockProxy = this._createOrUpdateBlob(coll, request);
        // Make sure that the parent blob exists on storage.
        return fs.ensureFile(request.parentUri)
            .then(() => {
                return fs.outputFile(request.uri, request.body, { encoding: request.httpProps[N.CONTENT_ENCODING] });
            })
            .then(() => {
                return new AzuriteResponse({ proxy: blockProxy });
            });
    }

    putBlockList(request) {
        let blockPaths = [];
        for (const block of request.payload) {
            const blockId = env.blockId(request.containerName, request.blobName, block.id);
            blockPaths.push(env.diskStorageUri(blockId));
        }
        // Updating properties of blob
        const coll = this.db.getCollection(request.containerName);
        const blobProxy = this._createOrUpdateBlob(coll, request);
        // Writing multiple blocks to one blob
        const combinedStream = CombinedStream.create();
        for (const path of blockPaths) {
            combinedStream.append(fs.createReadStream(path));
        }
        return new BbPromise((resolve, reject) => {
            const destinationStream = fs.createWriteStream(request.uri);
            destinationStream
                .on('error', (e) => {
                    reject(e);
                })
                .on('finish', () => {
                    let totalSize = 0;
                    // Set Blocks in DB to committed = true, delete blocks not in BlockList
                    const promises = [];
                    const blocks = coll.chain()
                        .find({ parentId: request.id })
                        .data();
                    for (const block of blocks) {
                        if (request.payload.map((e) => { return e.id }).indexOf(block.blockId) !== -1) {
                            block.committed = true;
                            totalSize += block.size;
                            coll.update(block);
                        } else {
                            coll.remove(block);
                            promises.push(fs.remove(block.uri));
                        }
                    }
                    return BbPromise.all(promises)
                        .then(() => {
                            blobProxy.original.size = totalSize;
                            this._clearCopyMetaData(blobProxy);
                            coll.update(blobProxy.release());
                            resolve(new AzuriteResponse({ proxy: blobProxy }));
                        });
                });
            combinedStream.pipe(destinationStream);
        });
    }

    getBlockList(request) {
        const coll = this.db.getCollection(request.containerName)
        const query = {
            '$and': [{
                parentId: request.id
            },
            {
                committed: (request.blockListType === BlockListType.COMMITTED || request.blockListType === BlockListType.ALL)
            }]
        }
        const blocks = coll.chain()
            .find(query)
            .data();

        const { blobProxy } = this._getCollectionAndBlob(request.containerName, request.id);
        const response = new AzuriteResponse({ proxy: blobProxy, payload: blocks });
        return BbPromise.resolve(response);
    }

    setBlobMetadata(request) {
        const { coll, blobProxy } = this._getCollectionAndBlob(request.containerName, request.id);
        blobProxy.original.metaProps = request.metaProps;
        coll.update(blobProxy.release());
        const response = new AzuriteResponse({ proxy: blobProxy });
        return BbPromise.resolve(response);
    }

    getBlobMetadata(request) {
        const { blobProxy } = this._getCollectionAndBlob(request.containerName, request.id);
        const response = new AzuriteResponse({ proxy: blobProxy });
        return BbPromise.resolve(response);
    }

    setBlobProperties(request) {
        const { coll, blobProxy } = this._getCollectionAndBlob(request.containerName, request.id);
        request.httpProps[N.CACHE_CONTROL] ? blobProxy.original.cacheControl = request.httpProps[N.CACHE_CONTROL] : delete blobProxy.original.cacheControl;
        request.httpProps[N.CONTENT_TYPE] ? blobProxy.original.contentType = request.httpProps[N.CONTENT_TYPE] : delete blobProxy.original.contentType;
        request.httpProps[N.CONTENT_ENCODING] ? blobProxy.original.contentEncoding = request.httpProps[N.CONTENT_ENCODING] : delete blobProxy.original.contentEncoding;
        request.httpProps[N.CONTENT_LANGUAGE] ? blobProxy.original.contentLanguage = request.httpProps[N.CONTENT_LANGUAGE] : delete blobProxy.original.contentLanguage;
        request.httpProps[N.CONTENT_DISPOSITION] ? blobProxy.original.contentDisposition = request.httpProps[N.CONTENT_DISPOSITION] : delete blobProxy.original.contentDisposition;
        request.httpProps[N.CONTENT_MD5] ? blobProxy.original.md5 = request.httpProps[N.CONTENT_MD5] : request.calculateContentMd5();
        this._clearCopyMetaData(blobProxy);
        coll.update(blobProxy.release());
        const response = new AzuriteResponse({ proxy: blobProxy });
        return BbPromise.resolve(response);
    }

    getBlobProperties(request) {
        // Same OP, different response headers are filtered and processeed at handler level
        return this.getBlobMetadata(request);
    }

    setContainerMetadata(request) {
        const { coll, containerProxy } = this._getCollectionAndContainer(request.containerName);
        containerProxy.original.metaProps = request.metaProps;
        coll.update(containerProxy.release());
        const response = new AzuriteResponse({ proxy: containerProxy });
        return BbPromise.resolve(response);
    }

    getContainerMetadata(request) {
        const { containerProxy } = this._getCollectionAndContainer(request.containerName);
        const response = new AzuriteResponse({ proxy: containerProxy });
        return BbPromise.resolve(response);
    }

    getContainerProperties(request) {
        const { containerProxy } = this._getCollectionAndContainer(request.containerName);
        const response = new AzuriteResponse({ proxy: containerProxy });
        return BbPromise.resolve(response);
    }

    putPage(request) {
        const parts = request.httpProps[N.RANGE].split('=')[1].split('-'),
            startByte = parseInt(parts[0]),
            endByte = parseInt(parts[1]);
        // Getting overlapping pages (sorted by startByte in ascending order)
        const { coll, blobProxy } = this._getCollectionAndBlob(request.containerName, request.id);
        const pageRanges = coll.chain()
            .find({
                '$and': [
                    { 'end': { '$gte': startByte / 512 } },
                    { 'start': { '$lte': (endByte + 1) / 512 } },
                    { 'parentId': { '$eq': request.id } }]
            })
            .sort((a, b) => {
                return a.start - b.start;
            })
            .data();

        this._updatePageRanges(coll, pageRanges, startByte, endByte, request.id);

        const pageWriteMode = request.httpProps[N.PAGE_WRITE],
            writeStream = fs.createWriteStream(request.uri, {
                flags: 'r+',
                start: startByte,
                defaultEncoding: 'utf8'
            });

        let pageContent;
        if (pageWriteMode === 'Update') {
            pageContent = request.body;
        }
        if (pageWriteMode === 'Clear') {
            pageContent = new Array(endbyte - startbyte + 1).fill('\0').join('');
        }
        return new BbPromise((resolve, reject) => {
            writeStream
                .on('error', (e) => {
                    reject(e);
                })
                .on('finish', () => {
                    // Fixme: Use async / non-blocking method instead 
                    blobProxy.original.size = fsn.statSync(request.uri).size;
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
        let pageRanges;
        const { coll, blobProxy } = this._getCollectionAndBlob(request.containerName, request.id);
        if (request.httpProps[N.RANGE]) {
            // If range exists it is guaranteed to be well-formed due to PageAlignment validation
            const parts = request.httpProps[N.RANGE].split('=')[1].split('-'),
                startByte = parseInt(parts[0]),
                endByte = parseInt(parts[1]);
            pageRanges = coll.chain()
                .find({
                    '$and': [
                        { 'end': { '$gte': startByte } },
                        { 'start': { '$lte': endByte } },
                        { 'parentId': { '$eq': request.id } }]
                })
                .sort((a, b) => {
                    return a.start - b.start;
                })
                .data();
        } else {
            pageRanges = coll.chain()
                .find({ 'parentId': { '$eq': request.id } })
                .sort((a, b) => {
                    return a.start - b.start;
                })
                .data();
        }

        const response = new AzuriteResponse({ proxy: blobProxy, payload: pageRanges });
        return BbPromise.resolve(response);
    }

    setContainerAcl(request) {
        const { coll, containerProxy } = this._getCollectionAndContainer(request.containerName);
        containerProxy.original.signedIdentifiers = request.payload;
        containerProxy.original.access = request.httpProps[N.BLOB_PUBLIC_ACCESS];
        coll.update(containerProxy.release());
        const response = new AzuriteResponse({ proxy: containerProxy });
        return BbPromise.resolve(response);
    }

    getContainerAcl(request) {
        const { containerProxy } = this._getCollectionAndContainer(request.containerName);
        const response = new AzuriteResponse({ proxy: containerProxy });
        return BbPromise.resolve(response);
    }

    snapshotBlob(request) {
        const { coll, blobProxy } = this._getCollectionAndBlob(request.containerName, request.id);
        const snapshotEntity = StorageEntityGenerator.clone(blobProxy.original);
        const snapshotDate = SnapshotTimeManager.getDate(request.id, new Date(request.now));
        snapshotEntity.snapshot = true;
        snapshotEntity.snapshotDate = snapshotDate.toUTCString();
        snapshotEntity.originId = request.id;
        snapshotEntity.originUri = request.uri;
        snapshotEntity.id = env.snapshotId(request.containerName, request.blobName, snapshotEntity.snapshotDate); // Updating ID due to possibly changed snapshot date
        snapshotEntity.uri = env.diskStorageUri(snapshotEntity.id);
        const snapshotProxy = new BlobProxy(coll.insert(snapshotEntity), request.containerName);
        if (Object.keys(request.metaProps).length > 0) {
            snapshotProxy.original.metaProps = request.metaProps;
            // The etag ans last-modified of the snapshot only changes from the original if metadata was added 
            snapshotProxy.updateETag();
        } else {
            snapshotProxy.original.meta.updated = blobProxy.original.meta.updated;
            snapshotProxy.original.meta.created = blobProxy.original.meta.created;
        }
        return fs.copy(request.uri, snapshotProxy.original.uri)
            .then(() => {
                const response = new AzuriteResponse({ proxy: snapshotProxy });
                return response;
            });
    }

    leaseContainer(request) {
        const leaseAction = request.httpProps[N.LEASE_ACTION],
            proposedLeaseId = request.httpProps[N.PROPOSED_LEASE_ID],
            leaseId = request.httpProps[N.LEASE_ID],
            leaseBreakPeriod = (request.httpProps[N.LEASE_BREAK_PERIOD]) ? parseInt(request.httpProps[N.LEASE_BREAK_PERIOD]) : undefined,
            leaseDuration = (request.httpProps[N.LEASE_DURATION]) ? parseInt(request.httpProps[N.LEASE_DURATION]) : undefined;
        const { coll, containerProxy } = this._getCollectionAndContainer(request.containerName);
        const now = request.now;

        switch (leaseAction) {
            case LeaseActions.ACQUIRE:
                containerProxy.original.leaseId = proposedLeaseId || uuidv4();
                containerProxy.original.leaseExpiredAt = (leaseDuration === -1) ? -1 : now + leaseDuration * 1000;
                containerProxy.original.leaseDuration = leaseDuration;
                containerProxy.original.leaseState = LeaseStatus.LEASED;
                break;
            case LeaseActions.RENEW:
                containerProxy.original.leaseExpiredAt = (containerProxy.original.leaseDuration === -1) ? -1 : now + containerProxy.original.leaseDuration * 1000;
                break;
            case LeaseActions.CHANGE:
                containerProxy.original.leaseId = proposedLeaseId;
                break;
            case LeaseActions.RELEASE:
                containerProxy.original.leaseState = LeaseStatus.AVAILABLE;
                break;
            case LeaseActions.BREAK:
                if (leaseBreakPeriod === undefined) {
                    containerProxy.original.leaseBrokenAt = (containerProxy.original.leaseExpiredAt === -1) ? now : containerProxy.original.leaseExpiredAt;
                } else if (containerProxy.original.leaseExpiredAt === -1) {
                    containerProxy.original.leaseBrokenAt = now + leaseBreakPeriod * 1000;
                } else {
                    const span = containerProxy.original.leaseExpiredAt - now;
                    containerProxy.original.leaseBrokenAt = (span > leaseBreakPeriod * 1000)
                        ? containerProxy.original.leaseBrokenAt = now + leaseBreakPeriod * 1000
                        : containerProxy.original.leaseBrokenAt = containerProxy.original.leaseExpiredAt;
                }
                containerProxy.original.leaseState = LeaseStatus.BREAKING;
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
        const { coll, blobProxy } = this._getCollectionAndBlob(request.containerName, request.id);
        const now = request.now;

        switch (leaseAction) {
            case LeaseActions.ACQUIRE:
                blobProxy.original.leaseId = proposedLeaseId || uuidv4();
                blobProxy.original.leaseExpiredAt = (leaseDuration === -1) ? -1 : now + leaseDuration * 1000;
                blobProxy.original.leaseDuration = leaseDuration;
                blobProxy.original.leaseState = LeaseStatus.LEASED;
                blobProxy.original.leaseETag = blobProxy.original.etag;
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

    copyBlob(request) {
        const sourceProxy = this._getCopySourceProxy(request);
        let from = null,
            to = null;

        from = fs.createReadStream(sourceProxy.original.uri);
        // TODO: if blob type is block also copy committed blocks
        to = fs.createWriteStream(env.diskStorageUri(request.id));
        from.pipe(to);

        const coll = this.db.getCollection(request.containerName),
            blobProxyDestination = this._createOrUpdateBlob(coll, request),
            copyId = uuidv4();

        blobProxyDestination.original.copyStatus = CopyStatus.PENDING;
        blobProxyDestination.original.copyStatusDescription = '';
        blobProxyDestination.original.copyId = copyId;
        CopyOperationsManager.add(copyId, from, to, env.diskStorageUri(request.id));
        let bytesCopied = 0;
        to.on('finish', () => {
            if (blobProxyDestination.original.copyStatus !== CopyStatus.FAILED) {
                blobProxyDestination.original.copyCompletionTime = new Date().toGMTString();
                blobProxyDestination.original.copyStatus = CopyStatus.SUCCESS;
                delete blobProxyDestination.original.copyStatusDescription;
                blobProxyDestination.original.copySource = sourceProxy.original.uri; 
                const { sourceContainerName, sourceBlobName } = request.copySourceName();
                // encode blobname in case there are unicode characters which are not supported by http headers per default
                blobProxyDestination.original.copySource = `http://localhost/devstoreaccount1/${sourceContainerName}/${encodeURIComponent(sourceBlobName)}`;
                blobProxyDestination.original.incrementalCopy = false;
                blobProxyDestination.original.size = sourceProxy.original.size;
                blobProxyDestination.original.entityType = sourceProxy.original.entityType;
                blobProxyDestination.original.md5 = sourceProxy.original.md5;
                blobProxyDestination.original.metaProps = (Object.keys(request.metaProps).length > 0)
                    ? request.metaProps
                    : sourceProxy.original.metaProps;
                CopyOperationsManager.clear(copyId);
                coll.update(blobProxyDestination.release());
            }
        });
        from.on('data', (chunk) => {
            bytesCopied += chunk.length;
            blobProxyDestination.original.copyProgress = `${bytesCopied}/${sourceProxy.original.size}`;
        });
        to.on('error', (err) => {
            blobProxyDestination.original.copyStatus = CopyStatus.FAILED;
            blobProxyDestination.original.copyStatusDescription = err.message;
            blobProxyDestination.original.completionTime = new Date().toGMTString();
            CopyOperationsManager.clear(copyId);
            t.end();
        });

        const response = new AzuriteResponse({ proxy: blobProxyDestination });
        return BbPromise.resolve(response);
    }

    abortCopyBlob(request) {
        return CopyOperationsManager.cancel(request.copyId)
            .then(() => {
                return new AzuriteResponse();
            });
    }

    _createOrUpdateBlob(coll, request) {
        const blob = coll.chain().find({ 'id': { '$eq': request.id } }).data();
        if (blob.length > 0) {
            coll.chain().find({ 'id': { '$eq': request.id } }).remove();
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
     * @param {String} id
     * @returns
     * 
     * @memberOf StorageManager
     */
    _getCollectionAndBlob(containerName, id) {
        const coll = this.db.getCollection(containerName);
        if (!coll) {
            return {
                coll: undefined,
                blobProxy: undefined
            };
        }
        const result = coll.chain()
            .find({ id: id })
            .data();
        return {
            coll: coll,
            blobProxy: (result.length === 0) ? undefined : new BlobProxy(result[0], containerName)
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
            containerProxy: (result.length === 0) ? undefined : new ContainerProxy(result[0])
        };
    }

    _updatePageRanges(coll, pageRanges, startByte, endByte, id) {
        const startAlignment = startByte / 512,
            endAlignment = (endByte + 1) / 512;
        coll.remove(pageRanges);
        coll.insert({
            parentId: id,
            start: startAlignment,
            end: endAlignment
        });
        const firstPage = pageRanges[0];
        const lastPage = pageRanges[pageRanges.length - 1];
        if (firstPage && startAlignment > firstPage.start) {
            coll.insert({
                parentId: id,
                start: firstPage.start,
                end: endAlignment - 1
            });
        }
        if (lastPage && endAlignment < lastPage.end) {
            coll.insert({
                parentId: id,
                start: endAlignment + 1,
                end: lastPage.end
            });
        }
    }

    _getCopySourceProxy(request) {
        // const { sourceContainerName, sourceBlobName, date } = request.copySourceName();
        const resp = request.copySourceName(),
            sourceContainerName = resp.sourceContainerName,
            sourceBlobName = resp.sourceBlobName, 
            date = resp.date;
        if (date !== undefined) {
            const { coll, blobProxy } = this._getCollectionAndBlob(sourceContainerName, env.snapshotId(sourceContainerName, sourceBlobName, date));
            if (blobProxy) {
                return blobProxy;
            }
        }
        const { coll, blobProxy } = this._getCollectionAndBlob(sourceContainerName, env.blobId(sourceContainerName, sourceBlobName));
        if (blobProxy) {
            return blobProxy;
        }
    }

    _clearCopyMetaData(proxy) {
        delete proxy.original.copyId;
        delete proxy.original.copyStatus;
        delete proxy.original.copyCompletionTime;
        delete proxy.original.copyStatusDescription;
        delete proxy.original.copyProgress;
        delete proxy.original.copySource;
        delete proxy.original.incrementalCopy;
        delete proxy.original.copyDestinationSnapshot;
    }
}

module.exports = new StorageManager;