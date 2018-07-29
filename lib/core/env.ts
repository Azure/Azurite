

const utils = require("./utils"),
    path = require("path"),
    BbPromise = require("bluebird"),
    crypto = require("crypto"),
    fs = BbPromise.promisifyAll(require("fs-extra"));

let initialized = false;

class Environment {
    azuriteWorkspacePath: any;
    azuriteRootPath: any;
    silent: any;
    accountAuth: any;
    dbNameBlob: string;
    dbNameTable: string;
    localStoragePath: any;
    azuriteDBPathBlob: any;
    azuriteDBPathTable: any;
    emulatedStorageAccountName: string;
    blobStoragePort: any;
    queueStoragePort: any;
    tableStoragePort: any;
    blobModulePath: any;
    queueModulePath: any;
    tableModulePath: any;
    constructor() {
    }

    init(options) {
        if (initialized && !options.overwrite) {
            return BbPromise.resolve();
        }
        initialized = true;
        this.azuriteWorkspacePath = options.l || options.location || process.cwd();
        this.azuriteRootPath = path.join(__dirname, "../..");
        this.silent = options.s || options.silent;
        this.accountAuth = options.a || options.accountAuth;
        this.dbNameBlob = "__azurite_db_blob__.json";
        this.dbNameTable = "__azurite_db_table__.json";
        this.localStoragePath = path.join(this.azuriteWorkspacePath, "__blobstorage__");
        this.azuriteDBPathBlob = path.join(this.azuriteWorkspacePath, this.dbNameBlob);
        this.azuriteDBPathTable = path.join(this.azuriteWorkspacePath, this.dbNameTable);
        this.emulatedStorageAccountName = "devstoreaccount1";
        this.blobStoragePort = options.p || options.blobPort || 10000;
        this.queueStoragePort = options.q || options.queuePort || 10001;
        this.tableStoragePort = options.t || options.tablePort || 10002;
        this.blobModulePath = path.join(this.azuriteRootPath, "bin", "blob");
        this.queueModulePath = path.join(this.azuriteRootPath, "bin", "queue");
        this.tableModulePath = path.join(this.azuriteRootPath, "bin", "table");
        return fs.mkdirsAsync(this.localStoragePath);
    }

    /**
     * Based on the request it creates the according URI that is served by Azurite"s internal web interface
     * directly powered by Node"s static file server.
     *
     * The id is hashed to avoid base64-encoded filenames (i.e. ids) longer than 255 characters which is not supported on some file systems.
     *
     * @param {string} id of the blob
     *
     * @memberof Environment
    * */
    webStorageUri(id) {
        const hash = crypto.createHash("sha1").update(id).digest("base64").replace(/\//g, "_");
        return `http://localhost:${this.blobStoragePort}/blobs/${hash}`;
    }

    /**
     * Creates the full path to the location of a blob on disk based on its ID.
     *
     * @param {any} id
     * @returns full path to blob on disk
     * @memberof Environment
     */
    diskStorageUri(id) {
        const hash = crypto.createHash("sha1").update(id).digest("base64").replace(/\//g, "_");
        return path.join(this.localStoragePath, hash);
    }

    // We prepend a specific character to guarantee unique ids.
    // This is neccessary since otherwise snapshot IDs could overlap with block IDs could overlap with block-/append-/page-blob IDs.
    blobId(containerName, blobName) {
        return Buffer.from(`A${containerName}${blobName}`, "utf8").toString("base64");
    }

    blockId(containerName, blobName, blockId) {
        return Buffer.from(`B${containerName}${blobName}${blockId}`, "utf8").toString("base64");
    }

    snapshotId(containerName, blobName, date) {
        return Buffer.from(`C${containerName}${blobName}${date}`, "utf8").toString("base64");
    }
}

export default new Environment();
