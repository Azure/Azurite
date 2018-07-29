const BbPromise = from "bluebird"),
  fs = from "fs");

class CopyOperationsManager {
  constructor() {
    this.ops = {};
  }

  public add(copyId, readStream, writeStream, toFilename) {
    this.ops[copyId] = {
      readStream,
      writeStream,
      toFilename
    };
  }

  public cancel(copyId) {
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

  public clear(copyId) {
    delete this.ops[copyId];
  }

  public isPending(copyId) {
    return this.ops[copyId] !== undefined;
  }
}

export default new CopyOperationsManager();
