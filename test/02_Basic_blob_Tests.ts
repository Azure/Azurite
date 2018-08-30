import chai from 'chai';
import chaiHttp from 'chai-http';
import AzuriteBlob from './../lib/AzuriteBlob';
import rp from 'request-promise';
import path from 'path';
import xml2js from 'xml2js';

const expect = chai.expect;
const should = chai.should();

chai.use(chaiHttp);

const containerName = "testcontainer";
const blockBlobName = "testblockblob";
const blockBlobCopiedName = "testblockblob_copied";
const appendBlobName = "testappendblob";
const pageBlobName = "testpageblob";
const url = `http://localhost:10000`;
const urlPath = `/devstoreaccount1`;
const testPath =
  new Date()
    .toISOString()
    .replace(/:/g, "")
    .replace(/\./g, "") + "_BLOB_TESTS";

function createBlob(containerNamex, blobNamex, payload, blobType) {
  // Make sure there is an existing container 'testcontainer'
  const optionsContainer = {
    method: "PUT",
    uri: `http://localhost:10000/devstoreaccount1/${containerNamex}?restype=container`,
    body: "",
  };
  const optionsBlob = {
    method: "PUT",
    headers: {
      "x-ms-blob-type": blobType,
      "Content-Type": "application/octet-stream",
    },
    uri: `http://localhost:10000/devstoreaccount1/${containerNamex}/${blobNamex}`,
    body: payload,
  };

  return rp(optionsContainer).then(() => {
    return rp(optionsBlob);
  });
}

describe('Blob HTTP API', () => {
    const azurite = new AzuriteBlob();

  before(() => {
    const location = path.join(process.env.AZURITE_LOCATION, testPath);
    return azurite
      .init({ l: location, silent: "true", overwrite: "true" })
      .then(() => {
        // Make sure there is an existing container 'testcontainer'
        const optionsContainer = {
          method: "PUT",
          uri: `http://localhost:10000/devstoreaccount1/${containerName}?restype=container`,
          body: "",
        };
        const optionsBlockBlob = {
          method: "PUT",
          headers: {
            "x-ms-blob-type": "BlockBlob",
            "Content-Type": "application/octet-stream",
          },
          uri: `http://localhost:10000/devstoreaccount1/${containerName}/${blockBlobName}`,
          body: "abc123",
        };
        const optionsAppendBlob = {
          method: "PUT",
          headers: {
            "x-ms-blob-type": "AppendBlob",
            "Content-Type": "application/octet-stream",
          },
          uri: `http://localhost:10000/devstoreaccount1/${containerName}/${appendBlobName}`,
          body: "",
        };
        const optionsPageBlob = {
          method: "PUT",
          headers: {
            "x-ms-blob-type": "PageBlob",
            "Content-Type": "application/octet-stream",
          },
          uri: `http://localhost:10000/devstoreaccount1/${containerName}/${pageBlobName}`,
          body: "",
        };
        return rp(optionsContainer)
          .then(() => {
            return rp(optionsBlockBlob);
          })
          .then(() => {
            return rp(optionsAppendBlob);
          })
          .then(() => {
            return rp(optionsPageBlob);
          });
      });
  });

  after(() => {
    return azurite.close();
  });

  describe("PUT Block Blob", () => {
    it("should fail to create a block due to missing container", () => {
      return chai
        .request(url)
        .put(`${urlPath}/DOESNOTEXISTS/blob`)
        .set("x-ms-blob-type", "BlockBlob")
        .set("Content-Type", "application/octet-stream")
        .send("THIS IS CONTENT")
        .catch((e) => {
          e.should.have.status(404);
        });
    });
    it("should fail to create a block due to wrong or unsupported blob type", () => {
      return chai
        .request(url)
        .put(`${urlPath}/${containerName}/blob`)
        .set("x-ms-blob-type", "NOTSUPPORTED")
        .set("Content-Type", "application/octet-stream")
        .send("THIS IS CONTENT")
        .catch((e) => {
          e.should.have.status(400);
        });
    });
    it("should create a simple block blob without meta headers", () => {
      return chai
        .request(url)
        .put(`${urlPath}/${containerName}/blob`)
        .set("x-ms-blob-type", "BlockBlob")
        .set("Content-Type", "application/octet-stream")
        .send("abcdefghijklmn")
        .then((res) => {
          res.should.have.status(201);
        });
    });
  });

  describe("Put BlockList", () => {
    const putBlockListBlobName = "dir/putBlockListBlobName";
    it("should create a block blob from a list of blocks", () => {
      const optionsBlockBlob = {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": 6,
        },
        qs: {
          comp: "block",
          blockid: "AAAAAA==",
        },
        uri: `http://localhost:10000/devstoreaccount1/${containerName}/${putBlockListBlobName}`,
        body: "AAAAAA",
      };

      return rp(optionsBlockBlob)
        .then(() => {
          optionsBlockBlob.body = "BBBBBB";
          optionsBlockBlob.qs.blockid = "BBBBBB==";
          return rp(optionsBlockBlob);
        })
        .then(() => {
          optionsBlockBlob.body = "CCCCCC";
          optionsBlockBlob.qs.blockid = "CCCCCC==";
          return rp(optionsBlockBlob);
        })
        .then(() => {
          optionsBlockBlob.body = "DDDDDD";
          optionsBlockBlob.qs.blockid = "DDDDDD==";
          return rp(optionsBlockBlob);
        })
        .then(() => {
          const xmlBody = `<!--?xml version="1.0" encoding="utf-8"?-->
                    <BlockList>
                        <Latest>AAAAAA==</Latest>
                        <Latest>CCCCCC==</Latest>
                        <Latest>AAAAAA==</Latest>
                    </BlockList>`;
          return chai
            .request(url)
            .put(`${urlPath}/${containerName}/${putBlockListBlobName}`)
            .query({ comp: "blocklist" })
            .send(xmlBody)
            .then((res) => {
              res.should.have.status(201);
            });
        });
    });
  });

    describe('Delete Blob', () => {
        it('should delete an existing Block Blob', () => {
            return createBlob('deleteblobtest', 'blob', 'abc123', 'BlockBlob')
                .then(() => {
                    return chai.request(url)
                        .del(`${urlPath}/deleteblobtest/blob`);
                })
                .then((res) => {
                    res.should.have.status(202);
                })
        });
        it('should fail when deleting a non-existant blob', () => {
            return chai.request(url)
                .del(`${urlPath}/deleteblobtest/DOESNOTEXIST`)
                .catch((e) => {
                    e.should.have.status(404);
                });
        });
        it('should fail when deleting from a non-existant container', () => {
            return chai.request(url)
                .del(`${urlPath}/DOESNOTEXIST/DOESNOTEXIST`)
                .catch((e) => {
                    e.should.have.status(404);
                });
        });
    });
  });

  describe("Append Blobs", () => {
    it("should create an append blob", () => {
      return chai
        .request(url)
        .put(`${urlPath}/${containerName}/appendBlob`)
        .set("x-ms-blob-type", "AppendBlob")
        .set("Content-Type", "application/octet-stream")
        .then((res) => {
          res.should.have.status(201);
        });
    });
    it("should append data to the append blob", () => {
      return chai
        .request(url)
        .put(`${urlPath}/${containerName}/appendBlob`)
        .query({ comp: "appendblock" })
        .set("x-ms-blob-type", "AppendBlob")
        .set("Content-Type", "application/octet-stream")
        .send("abcdefghi")
        .then((res) => {
          res.should.have.status(201);
        });
    });
    it("should fail to create an append blob with size > 0", () => {
      return chai
        .request(url)
        .put(`${urlPath}/${containerName}/appendBlob`)
        .set("x-ms-blob-type", "AppendBlob")
        .set("Content-Type", "application/octet-stream")
        .send("abcdefg")
        .catch((e) => {
          e.should.have.status(409);
        });
    });
  });

    describe('Page Blobs', () => {
        it('should get an empty page list from the page blob', () => {
            return chai.request(url)
                .get(`${urlPath}/${containerName}/${pageBlobName}`)
                .query({ comp: 'pagelist' })
                .then((res) => {
                    res.should.have.status(200);
                    new xml2js.Parser().parseString(res.text, function(err, result) {
			            expect(result.PageList).to.not.have.any.keys('PageRange');
		            });
                });
        });
    });
    it("should write data to the page blob range [0-511]", () => {
      const bodydata = Buffer.alloc(512);
      return chai
        .request(url)
        .put(`${urlPath}/${containerName}/${pageBlobName}`)
        .query({ comp: "page" })
        .set("x-ms-page-write", "update")
        .set("x-ms-range", "bytes=0-511")
        .set("Content-Type", "application/octet-stream")
        .send(bodydata)
        .then((res) => {
          res.should.have.status(201);
        });
    });
    it("should fail to write data to the page blob with an invalid range", () => {
      const bodydata = Buffer.alloc(513);
      return chai
        .request(url)
        .put(`${urlPath}/${containerName}/${pageBlobName}`)
        .query({ comp: "page" })
        .set("x-ms-page-write", "update")
        .set("x-ms-range", "bytes=0-512")
        .set("Content-Type", "application/octet-stream")
        .send(bodydata)
        .catch((e) => {
          e.should.have.status(416);
        });
    });
    it("should fail to write data to the page blob with an invalid body length", () => {
      const bodydata = Buffer.alloc(513);
      return chai
        .request(url)
        .put(`${urlPath}/${containerName}/${pageBlobName}`)
        .query({ comp: "page" })
        .set("x-ms-page-write", "update")
        .set("x-ms-range", "bytes=0-511")
        .set("Content-Type", "application/octet-stream")
        .send(bodydata)
        .catch((e) => {
          e.should.have.status(400);
        });
        it('should get the page range [0-511] from the page blob', () => {
            return chai.request(url)
                .get(`${urlPath}/${containerName}/${pageBlobName}`)
                .query({ comp: 'pagelist' })
                .then((res) => {
                    res.should.have.status(200);
                    new xml2js.Parser().parseString(res.text, function(err, result) {
                        expect(result.PageList.PageRange.length).to.equal(1);
                        expect(result.PageList.PageRange[0]).to.deep.equal({"Start":["0"],"End":["511"]});
                    });
                });
        });
        it('should get the page range [0-511] from the page blob within range [0-1023]', () => {
            return chai.request(url)
                .get(`${urlPath}/${containerName}/${pageBlobName}`)
                .query({ comp: 'pagelist' })
                .set('x-ms-range', 'bytes=0-1023')
                .then((res) => {
                    res.should.have.status(200);
                    new xml2js.Parser().parseString(res.text, function(err, result) {
                        expect(result.PageList.PageRange.length).to.equal(1);
                        expect(result.PageList.PageRange[0]).to.deep.equal({"Start":["0"],"End":["511"]});
                    });
                });
        });
    });
    it("should fail to get the page list from the page blob within an invalid range", () => {
      return chai
        .request(url)
        .get(`${urlPath}/${containerName}/${pageBlobName}`)
        .query({ comp: "pagelist" })
        .set("x-ms-range", "bytes=0-1095")
        .catch((e) => {
          e.should.have.status(416);
        });
    });
    it("should write data to the page blob range [1024-1535]", () => {
      const bodydata = Buffer.alloc(512);
      return chai
        .request(url)
        .put(`${urlPath}/${containerName}/${pageBlobName}`)
        .query({ comp: "page" })
        .set("x-ms-page-write", "update")
        .set("x-ms-range", "bytes=1024-1535")
        .set("Content-Type", "application/octet-stream")
        .send(bodydata)
        .then((res) => {
          res.should.have.status(201);
        });
        it('should get the page ranges [0-511],[1024-1535] from the page blob', () => {
            return chai.request(url)
                .get(`${urlPath}/${containerName}/${pageBlobName}`)
                .query({ comp: 'pagelist' })
                .then((res) => {
                    res.should.have.status(200);
                    new xml2js.Parser().parseString(res.text, function(err, result) {
                        expect(result.PageList.PageRange.length).to.equal(2);
                        expect(result.PageList.PageRange[0]).to.deep.equal({"Start":["0"],"End":["511"]});
                        expect(result.PageList.PageRange[1]).to.deep.equal({"Start":["1024"],"End":["1535"]});
                    });
                });
        });
    });
    it("should write data to the page blob range [512-1023]", () => {
      const bodydata = Buffer.alloc(512);
      return chai
        .request(url)
        .put(`${urlPath}/${containerName}/${pageBlobName}`)
        .query({ comp: "page" })
        .set("x-ms-page-write", "update")
        .set("x-ms-range", "bytes=512-1023")
        .set("Content-Type", "application/octet-stream")
        .send(bodydata)
        .then((res) => {
          res.should.have.status(201);
        });
        it('should get the page range [0-1535] from the page blob', () => {
            return chai.request(url)
                .get(`${urlPath}/${containerName}/${pageBlobName}`)
                .query({ comp: 'pagelist' })
                .then((res) => {
                    res.should.have.status(200);
                    new xml2js.Parser().parseString(res.text, function(err, result) {
                        expect(result.PageList.PageRange.length).to.equal(1);
                        expect(result.PageList.PageRange[0]).to.deep.equal({"Start":["0"],"End":["1535"]});
                    });
                });
        });
    });
    it("should clear data in the page blob range [512-1023]", () => {
      return chai
        .request(url)
        .put(`${urlPath}/${containerName}/${pageBlobName}`)
        .query({ comp: "page" })
        .set("x-ms-page-write", "clear")
        .set("x-ms-range", "bytes=512-1023")
        .then((res) => {
          res.should.have.status(201);
        });
        it('should get the page ranges [0-511],[1024-1535] from the page blob', () => {
            return chai.request(url)
                .get(`${urlPath}/${containerName}/${pageBlobName}`)
                .query({ comp: 'pagelist' })
                .then((res) => {
                    res.should.have.status(200);
                    new xml2js.Parser().parseString(res.text, function(err, result) {
                        expect(result.PageList.PageRange.length).to.equal(2);
                        expect(result.PageList.PageRange[0]).to.deep.equal({"Start":["0"],"End":["511"]});
                        expect(result.PageList.PageRange[1]).to.deep.equal({"Start":["1024"],"End":["1535"]});
                    });
                });
        });
    });
  });

  describe("GET Blob", () => {
    it("should get the correct content of the Block Blob", () => {
      const optionsBlockBlobGet = {
        method: "GET",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        uri: `http://localhost:10000/devstoreaccount1/${containerName}/${blockBlobName}`,
      };
      return rp(optionsBlockBlobGet).then((res) => {
        expect(res).to.be.equal("abc123");
      });
    });
    it("should get the correct type of the append blob", () => {
      return chai
        .request(url)
        .get(`${urlPath}/${containerName}/${appendBlobName}`)
        .then((res) => {
          res.should.have.status(200);
          res.should.have.header("x-ms-blob-type", "AppendBlob");
        });
    });
  });

  describe("Blob Metadata", () => {
    it("should update an existing blob with metadata.", () => {
      return chai
        .request(url)
        .put(`${urlPath}/${containerName}/${blockBlobName}`)
        .query({ comp: "metadata" })
        .set("x-ms-meta-test1", "value1")
        .set("x-ms-meta-test2", "value2")
        .set("x-ms-meta-meta1", "meta1Value")
        .then((res) => {
          res.should.have.status(200);
        });
    });
    it("should get the correct metadata", () => {
      return chai
        .request(url)
        .get(`${urlPath}/${containerName}/${blockBlobName}`)
        .query({ comp: "metadata" })
        .then((res) => {
          res.should.have.status(200);
          res.should.have.header("x-ms-meta-test1", "value1");
          res.should.have.header("x-ms-meta-test2", "value2");
          res.should.have.header("x-ms-meta-meta1", "meta1Value");
          res.should.have.header("Last-Modified");
          res.should.have.header("ETag");
        });
    });
    it("should fail to get metadata of a non-existant blob", () => {
      return chai
        .request(url)
        .get(`${urlPath}/${containerName}/BLOB_DOESNOTEXISTS`)
        .query({ comp: "metadata" })
        .catch((e) => {
          e.should.have.status(404);
        });
    });
    it("should fail to get metadata of a blob in a non-existant container", () => {
      return chai
        .request(url)
        .get(`${urlPath}/CONTAINER_DOESNOTEXIST/BLOB_DOESNOTEXISTS`)
        .query({ comp: "metadata" })
        .catch((e) => {
          e.should.have.status(404);
        });
    });
  });

  describe("Blob Properties", () => {
    it("should successfully set all system properties", () => {
      return chai
        .request(url)
        .put(`${urlPath}/${containerName}/${blockBlobName}`)
        .set("x-ms-blob-cache-control", "true")
        .set("x-ms-blob-content-type", "ContentType")
        .set("x-ms-blob-content-md5", "ContentMD5")
        .set("x-ms-blob-content-encoding", "ContentEncoding")
        .set("x-ms-blob-content-language", "ContentLanguage")
        .query({ comp: "properties" })
        .then((res) => {
          res.should.have.status(200);
        });
    });
    it("should get all previously set system properties", () => {
      return chai
        .request(url)
        .head(`${urlPath}/${containerName}/${blockBlobName}`)
        .then((res) => {
          res.should.have.status(200);
          res.should.have.header("ETag");
          res.should.have.header("Last-Modified");
          res.should.have.header("Content-Type", "ContentType");
          res.should.have.header("Content-Encoding", "ContentEncoding");
          res.should.have.header("Content-MD5", "ContentMD5");
          res.should.have.header("Content-Language", "ContentLanguage");
          res.should.have.header("Cache-Control", "true");
          res.should.have.header("x-ms-blob-type", "BlockBlob");
        });
    });
  });

  describe("Copy Blob", () => {
    it("should copy a blob with same properties with source blob", () => {
      const optionsProperties = {
        method: "PUT",
        headers: {
          "x-ms-blob-content-type": "Content-Type",
          "x-ms-blob-content-encoding": "Content-Encoding",
          "x-ms-blob-content-language": "Content-Language",
          "x-ms-blob-cache-control": "true",
          "x-ms-blob-content-md5": "Content-MD5",
          "x-ms-blob-content-disposition": "Content-Disposition",
        },
        qs: {
          comp: "properties",
        },
        uri: `http://localhost:10000/devstoreaccount1/${containerName}/${blockBlobName}`,
      };

      const optionsCopyBlob = {
        method: "PUT",
        headers: {
          "x-ms-copy-source": `http://localhost:10000/devstoreaccount1/${containerName}/${blockBlobName}`,
        },
        uri: `http://localhost:10000/devstoreaccount1/${containerName}/${blockBlobCopiedName}`,
      };

      return rp(optionsProperties)
        .then(() => {
          return rp(optionsCopyBlob);
        })
        .then(() => {
          return chai
            .request(url)
            .head(`${urlPath}/${containerName}/${blockBlobCopiedName}`)
            .then((res) => {
              res.should.have.status(200);
              res.should.have.header("Content-Type", "Content-Type");
              res.should.have.header("Content-Encoding", "Content-Encoding");
              res.should.have.header("Content-MD5", "Content-MD5");
              res.should.have.header("Content-Language", "Content-Language");
              res.should.have.header("Cache-Control", "true");
              res.should.have.header(
                "Content-Disposition",
                "Content-Disposition"
              );
              res.should.have.header("x-ms-blob-type", "BlockBlob");
            });
        });
    });
  });
});
