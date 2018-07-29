const BbPromise = require("bluebird"),
  fs = require("fs");

class CopyOperationsManager {
  constructor() {
    this.ops = {};
  }

  add(copyId, readStream, writeStream, toFilename) {
    this.ops[copyId] = {
      readStream: readStream,
      writeStream: writeStream,
      toFilename: toFilename
    };
  }

  cancel(copyId) {
    return new BbPromise((resolve, reject) => {
      this.ops[copyId].writeStream.on("unpipe", () => {
        fs.unlink(this.ops[copyId].toFilename, err => {
          this.clear(copyId);
          err ? reject(err) : resolve();
        });
      });
      this.ops[copyId].readStream.unpipe(writeStream);
    });
  }

  clear(copyId) {
    delete this.ops[copyId];
  }

  isPending(copyId) {
    return this.ops[copyId] !== undefined;
  }
}

export default new CopyOperationsManager();
