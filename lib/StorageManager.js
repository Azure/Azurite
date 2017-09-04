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
    BlobProxy = require('./model/BlobProxy'),
    N = require('./model/HttpHeaderNames'),
    ContainerRequest = require('./model/AzuriteContainerRequest'),
    AzuriteResponse = require('./model/AzuriteResponse'),
    BlobRequest = require('./model/AzuriteBlobRequest'),
    SnapshotTimeManager = require('./SnapshotTimeManager'),
    uuidv4 = require('uuid/v4');

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
        return fs.removeAsync(request.fullPath())
            .then(() => {
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
                    return new AzuriteResponse({});
                });
        } else if (snapshoteDeleteQueryParam === 'only') {
            coll.chain().find({ 'origin': { '$eq': request.blobName } }).remove();
            return BbPromise.resolve(new AzuriteResponse({}));
        } else {
            coll.chain().find({ 'name': { '$eq': request.blobName } }).remove();
            return fs.removeAsync(env.diskStorageUri(request))
                .then(() => {
                    return new AzuriteResponse({});
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

    listBlobs(request, query) {
        const condition = [];
        condition.push({
            'name': { '$contains': query.prefix }
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
        const { blobProxy } = this._getCollectionAndBlob(request.containerName, request.blobName);
        if (blobProxy === undefined) {
            const containerColl = this.db.getCollection(request.containerName);
            this._createOrUpdateBlob(containerColl, request, request.blobName);
        }
        // Storing block information in DB.
        const commitColl = this.db.getCollection(StorageTables.Commits);
        const blockProxy = this._createOrUpdateBlob(commitColl, request, request.blockName);
        // Make sure that the parent blob exists on storage.
        return fs.ensureFileAsync(env.diskStorageUri(request, true))
            .then(() => {
                // Writing block to disk.
                return fs.outputFileAsync(env.diskStorageUri(request), request.body, { encoding: request.httpProps[N.CONTENT_ENCODING] });
            })
            .then(() => {
                return new AzuriteResponse({ proxy: blockProxy });
            });
    }

    putBlockList(request) {
        let blockPaths = [];
        for (const block of request.payload) {
            // FIXME: This should be refactored since it is defined 4 times (here, validation.js, StorageEntityGenerator, AzureBlobRequest) 
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
                        if (request.payload.map((e) => { return e.id }).indexOf(block.blockId) !== -1) {
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

        const { blobProxy } = this._getCollectionAndBlob(request.containerName, request.publicName());
        const response = new AzuriteResponse({ proxy: blobProxy, payload: blocks });
        return BbPromise.resolve(response);
    }

    setBlobMetadata(request) {
        const { coll, blobProxy } = this._getCollectionAndBlob(request.containerName, request.publicName());
        blobProxy.original.metaProps = request.metaProps;
        coll.update(blobProxy.release());
        const response = new AzuriteResponse({ proxy: blobProxy });
        return BbPromise.resolve(response);
    }

    getBlobMetadata(request) {
        const { blobProxy } = this._getCollectionAndBlob(request.containerName, request.publicName());
        const response = new AzuriteResponse({ proxy: blobProxy });
        return BbPromise.resolve(response);
    }

    setBlobProperties(request) {
        const { coll, blobProxy } = this._getCollectionAndBlob(request.containerName, request.blobName);
        request.httpProps[N.CACHE_CONTROL] ? blobProxy.original.cacheControl = request.httpProps[N.CACHE_CONTROL] : delete blobProxy.original.cacheControl;
        request.httpProps[N.CONTENT_TYPE] ? blobProxy.original.contentType = request.httpProps[N.CONTENT_TYPE] : delete blobProxy.original.contentType;
        request.httpProps[N.CONTENT_ENCODING] ? blobProxy.original.contentEncoding = request.httpProps[N.CONTENT_ENCODING] : delete blobProxy.original.contentEncoding;
        request.httpProps[N.CONTENT_LANGUAGE] ? blobProxy.original.contentLanguage = request.httpProps[N.CONTENT_LANGUAGE] : delete blobProxy.original.contentLanguage;
        request.httpProps[N.CONTENT_DISPOSITION] ? blobProxy.original.contentDisposition = request.httpProps[N.CONTENT_DISPOSITION] : delete blobProxy.original.contentDisposition;
        request.httpProps[N.CONTENT_MD5] ? blobProxy.original.md5 = request.httpProps[N.CONTENT_MD5] : request.calculateContentMd5();
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
                    const { coll, blobProxy } = this._getCollectionAndBlob(request.containerName, request.blobName);
                    // Fixme: Use async / non-blocking method instead 
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
        const { coll, blobProxy } = this._getCollectionAndBlob(request.containerName, request.blobName);
        const snapshotEntity = StorageEntityGenerator.clone(blobProxy.original);
        snapshotEntity.snapshot = true;
        const snapshotDate = SnapshotTimeManager.getDate(request.containerName, request.blobName);
        request.enableSnapshot(snapshotDate.toUTCString());
        snapshotEntity.snapshotDate = snapshotDate.toUTCString();
        snapshotEntity.name = request.publicName();
        snapshotEntity.origin = request.blobName;
        const snapshotProxy = new BlobProxy(coll.insert(snapshotEntity), request.containerName);
        if (Object.keys(request.metaProps).length > 0) {
            snapshotProxy.original.metaProps = request.metaProps;
            // The etag of the snapshot only changes from the original if metadata was added 
            snapshotProxy.updateETag();
        }
        const destPath = path.join(env.snapshotPath, snapshotProxy.containerName, snapshotProxy.original.name);
        return fs.ensureDirAsync(path.join(env.snapshotPath, snapshotProxy.containerName))
            .then(() => {
                return fs.copyAsync(env.diskStorageUri(request, true), destPath);
            })
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
        const { coll, blobProxy } = this._getCollectionAndBlob(request.containerName, request.blobName);
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