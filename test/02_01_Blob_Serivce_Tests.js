/** @format */

const chai = require("chai"),
  chaiHttp = require("chai-http"),
  should = chai.should(),
  expect = chai.expect,
  BbPromise = require("bluebird"),
  fs = BbPromise.promisifyAll(require("fs-extra")),
  Azurite = require("../lib/AzuriteBlob"),
  rp = require("request-promise"),
  path = require("path"),
  xml2js = require("xml2js"),
  azureStorage = require("azure-storage");

chai.use(chaiHttp);

const tableName = "testtable";
// after testing, we need to clean up the DB files etc that we create.
// I wanted to shorten the cycles while debugging so create a new path
// with each pass of the debugger
const blobServiceTestPath =
  new Date()
    .toISOString()
    .replace(/:/g, "")
    .replace(/\./g, "") + "_BLOBSERVICE_TESTS";
const blobService = azureStorage.createBlobService(
  "UseDevelopmentStorage=true"
);

describe("Blob Service Tests", () => {
    const azurite = new Azurite();
    let serviceProps = {};
    before(() => {
        return new Promise((resolve) => {
            azurite
                .init({
                    l: blobServiceTestPath,
                    silent: "true",
                    overwrite: "true",
                })
                .then(()=>{
                    const options = {};
                    blobService.getServiceProperties((options, errOrResult) => {
                        serviceProps = errOrResult;
                        resolve();
                    });
                });
        });
    });

    // https://docs.microsoft.com/en-us/rest/api/storageservices/get-blob-service-properties
    // at the time of writing this test Azurite API Version is : "2016-05-31";
    describe("GET Blob Service Properties", () => {
        it("should retrieve a valid set of blobService properties", (done) => {
            expect(serviceProps).to.not.be.equal(undefined);
            // Logging
            expect(serviceProps.Logging.Version).to.be.equal("1.0"); 
            expect(serviceProps.Logging.Delete).to.be.equal(true);
            expect(serviceProps.Logging.Read).to.be.equal(true);
            expect(serviceProps.Logging.Write).to.be.equal(true);
            expect(serviceProps.Logging.RetentionPolicy.Enabled).to.be.equal(false);
            // Hour Metrics
            expect(serviceProps.HourMetrics.Version).to.be.equal("1.0"); 
            expect(serviceProps.HourMetrics.Enabled).to.be.equal(false);
            expect(serviceProps.HourMetrics.RetentionPolicy.Enabled).to.be.equal(false);
            // // Minute Metrics
            expect(serviceProps.MinuteMetrics.Version).to.be.equal("1.0"); 
            expect(serviceProps.MinuteMetrics.Enabled).to.be.equal(false);
            expect(serviceProps.MinuteMetrics.RetentionPolicy.Enabled).to.be.equal(false);
            // Cors
            expect(serviceProps.Cors).to.not.be.equal(null);
            // Service Version String
            expect(serviceProps.DefaultServiceVersion).to.be.equal("2013-08-15");
            done();
        });
    });

    after(() => {
        return azurite.close();
      });

});