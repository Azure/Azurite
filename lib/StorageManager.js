'use strict';

const env = require('./env'),
    path = require('path'),
    BbPromise = require('bluebird'),
    Loki = require('lokijs'),
    fs = BbPromise.promisifyAll(require("fs-extra")),
    md5 = require('md5'),
    CombinedStream = require('combined-stream'),
    BlobHttpProperties = require('./model/BlobHttpProperties');

const CONTAINERS_COL_NAME = 'Containers',
    COMMITS = 'Commits';

class StorageManager {
    constructor() {
        this.dbName = '__azurite_db__.json'
    }

    init(localStoragePath) {
        this.db = BbPromise.promisifyAll(new Loki(env.azuriteDBPath, { autosave: true, autosaveInterval: 5000 }));
        return fs.statAsync(env.azuriteDBPath)
            .then((stat) => {
                return this.db.loadDatabaseAsync(env.dbName);
            })
            .then((data) => {
                if (!this.db.getCollection(CONTAINERS_COL_NAME)) {
                    this.db.addCollection(CONTAINERS_COL_NAME);
                    return this.db.saveDatabaseAsync();
                }
            })
            .catch((e) => {
                if (e.code === 'ENOENT') {
                    // No DB hasn't been persisted / initialized yet.
                    this.db.addCollection(CONTAINERS_COL_NAME);
                    this.db.addCollection(COMMITS);
                    return this.db.saveDatabaseAsync();
                }
                // This should never happen!
                console.error(`Failed to initialize database at "${this.dbPath}"`);
                throw e;
            });
    }

    createContainer(model) {
        let p = path.join(env.localStoragePath, model.name);
        return fs.mkdirAsync(p)
            .then(() => {
                let tables = this.db.getCollection(CONTAINERS_COL_NAME);
                tables.insert({ name: model.name, http_props: model.httpProps, meta_props: model.metaProps, access: model.access });
            });
    }

    deleteContainer(name) {
        let container = path.join(env.localStoragePath, name);
        return fs.statAsync(container)
            .then((stat) => {
                return fs.removeAsync(container);
            })
            .then(() => {
                let tables = this.db.getCollection(CONTAINERS_COL_NAME);
                tables.chain().find({ 'name': { '$eq': name } }).remove();
                this.db.removeCollection(name);
            });
    }

    listContainer(prefix, maxresults) {
        return BbPromise.try(() => {
            maxresults = parseInt(maxresults);
            let tables = this.db.getCollection(CONTAINERS_COL_NAME);
            let result = tables.chain()
                .find({ 'name': { '$contains': prefix } })
                .simplesort('name')
                .limit(maxresults)
                .data();
            return result;
        });
    }

    createBlockBlob(container, blobName, body, httpProps, metaProps) {
        let containerPath = path.join(env.localStoragePath, container);
        let blobPath = path.join(containerPath, blobName);
        let response = {};
        const targetMD5 = md5(body);
        httpProps.ContentMD5 = targetMD5;
        return fs.statAsync(containerPath)
            .then((stat) => {
                const sourceMD5 = httpProps['Content-MD5'];
                response.md5 = targetMD5;
                if (sourceMD5) {
                    if (targetMD5 !== sourceMD5) {
                        const err = new Error('MD5 hash corrupted.');
                        err.name = 'md5';
                        throw err;
                    }
                }
            })
            .then(() => {
                // Container exists, otherwise fs.statAsync throws error
                return fs.outputFileAsync(blobPath, body, { encoding: httpProps['Content-Encoding'] });
            })
            .then(() => {
                let coll = this.db.getCollection(container);
                if (!coll) {
                    coll = this.db.addCollection(container);
                }
                const blobResult = coll.chain()
                    .find({ 'name': { '$eq': blobName } })
                    .data();

                if (blobResult.length === 0) {
                    const newBlob = coll.insert({
                        name: blobName,
                        http_props: httpProps,
                        meta_props: metaProps
                    });
                    response.ETag = newBlob.meta.revision;
                    response.lastModified = httpProps.lastModified;
                } else {
                    const updateBlob = blobResult[0];
                    updateBlob.http_props = httpProps;
                    updateBlob.meta_props = metaProps;
                    coll.update(updateBlob);
                    response.ETag = updateBlob.meta.revision;
                    response.lastModified = httpProps.lastModified;
                }
            })
            .then(() => {
                return response;
            });
    }

    deleteBlob(container, name) {
        let blobPath = path.join(env.localStoragePath, container, name);
        return fs.statAsync(blobPath)
            .then((stat) => {
                return fs.removeAsync(blobPath);
            })
            .then(() => {
                let coll = this.db.getCollection(container);
                coll.chain().find({ 'name': { '$eq': name } }).remove();
            });
    }

    getBlob(containerName, blobName) {
        const response = {};
        const blobPath = path.join(env.localStoragePath, containerName, blobName);
        response.blobPath = blobPath;
        response.x_ms_server_encrypted = false;
        return fs.statAsync(blobPath)
            .then((stat) => {
                const coll = this.db.getCollection(containerName);
                const blob = coll.chain()
                    .find({ 'name': { '$eq': blobName } })
                    .data()[0];
                response.httpProps = blob.http_props;
                response.metaProps = blob.meta_props;
                response.ETag = blob.meta.revision;
                return response;
            })
    }

    listBlobs(containerName, options) {
        return BbPromise.try(() => {
            const coll = this.db.getCollection(containerName);
            if (!coll) {
                const e = new Error();
                e.code = 'ContainerNotFound';
                throw e;
            }
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
        const response = {};
        const blobPath = path.join(env.localStoragePath, containerName, blobName);
        // Make sure that the parent blob exists on storage.
        return fs.ensureFileAsync(blobPath)
            .then(() => {
                let coll = this.db.getCollection(containerName);
                if (!coll) {
                    coll = this.db.addCollection(containerName);
                }
                const blobResult = coll.chain()
                    .find({ 'name': { '$eq': blobName } })
                    .data();

                // We only create the blob in DB if it does not already exists.
                if (blobResult.length === 0) {
                    const httpProps = new BlobHttpProperties();
                    httpProps.committed = false;
                    coll.insert({
                        name: blobName,
                        http_props: httpProps
                    });
                }

                // Checking MD5 in case 'Content-MD5' header was set.
                const sourceMD5 = options.httpProps['Content-MD5'];
                const targetMD5 = md5(body);
                response['Content-MD5'] = targetMD5;
                if (sourceMD5) {
                    if (targetMD5 !== sourceMD5) {
                        const err = new Error('MD5 hash corrupted.');
                        err.name = 'md5';
                        throw err;
                    }
                }
            })
            .then(() => {
                // Writing block to disk.
                const blockPath = path.join(env.commitsPath, options.fileName);
                return fs.outputFileAsync(blockPath, body, { encoding: options.httpProps['Content-Encoding'] });
            })
            .then(() => {
                // Storing block information in DB.
                const coll = this.db.getCollection(COMMITS);
                const blobResult = coll.chain()
                    .find({ 'name': { '$eq': options.fileName } })
                    .data();

                if (blobResult.length === 0) {
                    const newBlob = coll.insert({
                        name: options.fileName,
                        blockId: options.blockId,
                        parent: options.parent,
                        http_props: options.httpProps
                    });
                    response.ETag = newBlob.meta.revision;
                    response.lastModified = options.httpProps.lastModified;
                } else {
                    const updateBlob = blobResult[0];
                    updateBlob.http_props = options.httpProps;
                    coll.update(updateBlob);
                    response.ETag = updateBlob.meta.revision;
                    response.lastModified = options.httpProps.lastModified;
                }
                return response;
            });
    }

    putBlockList(containerName, blobName, blockList, httpProps, metaProps) {
        const response = {};
        return BbPromise.try(() => {
            const combinedStream = CombinedStream.create();
            for (const block of blockList) {
                const blockName = `${containerName}-${blobName}-${block.id}`;
                const blockPath = path.join(env.commitsPath, blockName);
                combinedStream.append(fs.createReadStream(blockPath));
            }
            const blobPath = path.join(env.localStoragePath, containerName, blobName);
            combinedStream.pipe(fs.createWriteStream(blobPath));

            const coll = this.db.getCollection(containerName);
            const blobResult = coll.chain()
                .find({ 'name': { '$eq': blobName } })
                .data();

            // Blob must exist in DB since preceding calls to "PUT Block"
            const updateBlob = blobResult[0];
            updateBlob.http_props = httpProps; // CHECK: committed = false?
            updateBlob.meta_props = metaProps;
            coll.update(updateBlob);
            response.ETag = updateBlob.meta.revision;
            response.lastModified = httpProps.lastModified;
        })
        .then(() => {
            // Set Blocks in DB to committed = true, delete blocks not in BlockList
            const coll = this.db.getCollection(COMMITS);
            const blocks = coll.chain()
                .find( { parent: `${containerName}-${blobName}` })
                .data();
            for (const block of blocks) {
                if (blockList.map((e) =>{ return e.id}).indexOf(block.blockId) !== -1) {
                    block.http_props.committed = true;
                    coll.update(block);
                } else {
                    coll.remove(block);
                }
            }
            return response;
        });
    }
}

module.exports = new StorageManager;