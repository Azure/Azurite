import BbPromise from "bluebird";
import fs from "fs";

class CopyOperationsManager {
  public ops: {};
  constructor() {
    this.ops = {};
  }

  public add(copyId, readStream, writeStream, toFilename) {
    this.ops[copyId] = {
      readStream,
      toFilename,
      writeStream
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
      this.ops[copyId].readStream.unpipe(this.ops[copyId].writeStream);
    });
  }

  public clear(copyId) {
    delete this.ops[copyId];
  }

  public isPending(copyId?: any) {
    return this.ops[copyId] !== undefined;
  }
}

export default new CopyOperationsManager();
