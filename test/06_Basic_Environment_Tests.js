/** @format */

const BbPromise = require("bluebird");
const Environment = require("../lib/core/env").constructor;

describe("Core", () => {
  describe("Environment", () => {
    it("should assign default port numbers where none are given", () => {
      const env = new Environment();

      const options = {};

      return env.init(options).then(() => {
        expect(env.blobStoragePort).to.equal(10000);
        expect(env.queueStoragePort).to.equal(10001);
        expect(env.tableStoragePort).to.equal(10002);
      });
    });

    it('should let the assignment of user-defined port numbers', () => {
      const tests = [
        {
          p: 1234,
          q: 5678,
          t: 9012
        },
        {
          blobPort: 1234,
          queuePort: 5678,
          tablePort: 9012
        }
      ]

      return BbPromise.all(tests.map((options) => {
        const env = new Environment();

        return env.init(options).then(() => {
          expect(env.blobStoragePort).to.equal(1234);
          expect(env.queueStoragePort).to.equal(5678);
          expect(env.tableStoragePort).to.equal(9012);
        });
      }));
    });
  });
});
