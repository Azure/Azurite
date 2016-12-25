'use strict';

const env = require('./env'),
    path = require('path'),
    BbPromise = require('bluebird'),
    Loki = require('lokijs'),
    fs = BbPromise.promisifyAll(require("fs-extra")),
    md5 = require('md5'),
    CombinedStream = require('combined-stream');

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

    createBlockBlob(container, blob, body) {
        let containerPath = path.join(env.localStoragePath, container);
        let blobPath = path.join(containerPath, blob.name);
        let response = {};
        const targetMD5 = md5(body);
        return fs.statAsync(containerPath)
            .then((stat) => {
                const sourceMD5 = blob.httpProps['Content-MD5'];
                blob.httpProps['Content-MD5'] = targetMD5;
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
                // Container exists, otherwise fs.statAsync throws error
                return fs.outputFileAsync(blobPath, body, { encoding: blob.httpProps['Content-Encoding'] });
            })
            .then(() => {
                let coll = this.db.getCollection(container);
                if (!coll) {
                    coll = this.db.addCollection(container);
                }
                const blobResult = coll.chain()
                    .find({ 'name': { '$eq': blob.name } })
                    .data();

                if (blobResult.length === 0) {
                    const newBlob = coll.insert({
                        name: blob.name,
                        http_props: blob.httpProps,
                        meta_props: blob.metaProps,
                        size: body.length
                    });
                    response.ETag = newBlob.meta.revision;
                    response['Last-Modified'] = blob.httpProps['Last-Modified'];
                } else {
                    const updateBlob = blobResult[0];
                    updateBlob.http_props = blob.httpProps;
                    updateBlob.meta_props = blob.metaProps;
                    updateBlob.size = body.length;
                    coll.update(updateBlob);
                    response.ETag = updateBlob.meta.revision;
                    response['Last-Modified'] = blob.httpProps['Last-Modified'];
                }
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
                response.httpProps.ETag = blob.meta.revision;
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
                    coll.insert({
                        name: blobName,
                        http_props: options.blob.httpProps,
                        committed: false,
                        size: 0
                    });
                }

                // Checking MD5 in case 'Content-MD5' header was set.
                const sourceMD5 = options.blob.httpProps['Content-MD5'];
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
                return fs.outputFileAsync(blockPath, body, { encoding: options.blob.httpProps['Content-Encoding'] });
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
                        http_props: options.blob.httpProps,
                        size: body.length, // in bytes
                        committed: false

                    });
                    response.ETag = newBlob.meta.revision;
                    response['Last-Modified'] = options.blob.httpProps['Last-Modified'];
                } else {
                    const updateBlob = blobResult[0];
                    updateBlob.http_props = options.blob.httpProps;
                    updateBlob.size = body.length;
                    updateBlob.committed = false;
                    coll.update(updateBlob);
                    response.ETag = updateBlob.meta.revision;
                    response['Last-Modified'] = options.blob.httpProps['Last-Modified'];
                }
                return response;
            });
    }

    putBlockList(containerName, blob, blockList) {
        const response = {};
        let blocks = [];
        return BbPromise.try(() => {
            let promises = [];
            for (const block of blockList) {
                const blockName = `${containerName}-${blob.name}-${block.id}`;
                const blockPath = path.join(env.commitsPath, blockName);
                blocks.push(blockPath);
                promises.push(fs.statAsync(blockPath));
            }
            // In case a block does not exists this will throw
            return BbPromise.all(promises);
        })
            .then(() => {
                const combinedStream = CombinedStream.create();
                for (const block of blocks) {
                    combinedStream.append(fs.createReadStream(block));
                }
                const blobPath = path.join(env.localStoragePath, containerName, blob.name);
                combinedStream.pipe(fs.createWriteStream(blobPath));

                const coll = this.db.getCollection(containerName);
                const blobResult = coll.chain()
                    .find({ 'name': { '$eq': blob.name } })
                    .data();

                // Blob must exist in DB since preceding calls to "PUT Block"
                const updateBlob = blobResult[0];
                updateBlob.http_props = blob.httpProps;
                updateBlob.meta_props = blob.metaProps;
                coll.update(updateBlob);
                response.ETag = updateBlob.meta.revision;
                response['Last-Modified'] = blob.httpProps['Last-Modified'];
            })
            .then(() => {
                // Set Blocks in DB to committed = true, delete blocks not in BlockList
                const promises = [];
                const coll = this.db.getCollection(COMMITS);
                const blocks = coll.chain()
                    .find({ parent: `${containerName}-${blob.name}` })
                    .data();
                for (const block of blocks) {
                    if (blockList.map((e) => { return e.id }).indexOf(block.blockId) !== -1) {
                        block.committed = true;
                        coll.update(block);
                    } else {
                        coll.remove(block);
                        promises.push(fs.removeAsync(path.join(env.commitsPath, block.name)));
                    }
                }
                return BbPromise.all(promises)
            })
            .then(() => {
                return response;
            })
    }

    getBlockList(containerName, blobName, blockListType) {
        let response = {};
        return fs.statAsync(path.join(env.localStoragePath, containerName))
            .then(() => {
                const coll = this.db.getCollection(COMMITS);
                if (!coll) {
                    const err = new Error('Inconsistent state.');
                    err.code = 'inconsistent';
                    throw err;
                }
                const query = this._buildBlockListQuery(containerName, blobName, blockListType);
                const blocks = coll.chain()
                    .find(query)
                    .data();
                response.blocks = blocks;
            })
            .then(() => {
                const coll = this.db.getCollection(containerName);
                const parentBlob = coll.find({ name: blobName });
                response.parentBlob = parentBlob[0];
                return response;
            });
    }

    setBlobMetadata(containerName, blob) {
        return BbPromise.try(() => {
            const res = this._getCollectionAndBlob(containerName, blob.name),
                coll = res.coll,
                blobToUpdate = res.blob;
            blobToUpdate.meta_props = blob.metaProps;
            blobToUpdate.http_props['Last-Modified'] = blob.httpProps['Last-Modified'];
            coll.update(blobToUpdate);
            return {
                ETag: blobToUpdate.meta.revision,
                'Last-Modified': blobToUpdate.http_props['Last-Modified']
            };
        });
    }

    getBlobMetadata(containerName, blobName) {
        return BbPromise.try(() => {
            const res = this._getCollectionAndBlob(containerName, blobName),
                blob = res.blob,
                httpProps = blob.http_props,
                metaProps = blob.meta_props;
            httpProps.ETag = blob.meta.revision;
            return {
                httpProps: httpProps,
                metaProps: metaProps
            };
        });
    }

    setBlobProperties(containerName, blob) {
        return BbPromise.try(() => {
            const res = this._getCollectionAndBlob(containerName, blob.name),
                blobToUpdate = res.blob,
                coll = res.coll;
            blobToUpdate.http_props = blob.httpProps;
            coll.update(blobToUpdate);
            return {
                'Last-Modified': blobToUpdate.http_props['Last-Modified'],
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
            const res = this._getCollectionAndContainer(container.name),
                containerToUpdate = res.container,
                coll = res.coll;
            containerToUpdate.meta_props = container.metaProps;
            containerToUpdate.http_Props = container.httpProps['Last-Modified'];
            coll.update(containerToUpdate);
            return {
                'Last-Modified': containerToUpdate.http_props['Last-Modified'],
                ETag: containerToUpdate.meta.revision
            }
        });
    }

    _getCollectionAndBlob(containerName, blobName) {
        const coll = this.db.getCollection(containerName);
        if (!coll) {
            const err = new Error('Container does not exist.');
            err.code = 'NO_CONTAINER';
            throw err;
        }
        const result = coll.chain()
            .find({ name: blobName })
            .data();
        if (result.length === 0) {
            const err = new Error('Blob does not exist.');
            err.code = 'NO_BLOB';
            throw err;
        }
        return {
            coll: coll,
            blob: result[0]
        };
    }

    _getCollectionAndContainer(containerName) {
        const coll = this.db.getCollection(CONTAINERS_COL_NAME);
        if (!coll) {
            // This should never happen
            const err = new Error('Collection does not exist.');
            err.code = 'FATAL';
            throw err;
        }
        const result = coll.chain()
            .find({ name: containerName })
            .data();
        if (result.length === 0) {
            const err = new Error('Container does not exist.');
            err.code = 'NO_CONTAINER';
            throw err;
        }
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