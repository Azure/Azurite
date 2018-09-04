/** @format */

import chai, { expect } from "chai";

import chaiHttp from "chai-http";
import BbPromise from "bluebird";
import Azurite from "../lib/AzuriteBlob";
import rp from "request-promise";
import path from "path";

import fs_extra from "fs-extra";

/** @format */
const should = chai.should();
const fs = BbPromise.promisifyAll(fs_extra);

chai.use(chaiHttp);

const containerName = "containertestcontainer";
const propContainer = "propTestcontainer";
const url = "http://localhost:10000";
const urlPath = "/devstoreaccount1";
const testPath =
  new Date()
    .toISOString()
    .replace(/:/g, "")
    .replace(/\./g, "") + "_CONTAINER_TESTS";

describe("Container HTTP API", () => {
  const azurite = new Azurite();

  beforeAll(() => {
    const azureitLocation = process.env.AZURITE_LOCATION;
    const location = path.join(".", azureitLocation, testPath);
    return azurite
      .init({ l: location, silent: "true", overwrite: "true" })
      .then(() => {
        // Make sure there is an existing container 'metadatatestcontainer'
        const optionsContainer = {
          method: "PUT",
          uri: `http://localhost:10000/devstoreaccount1/${propContainer}?restype=container`,
          body: "",
        };
        return rp(optionsContainer);
      });
  });

  afterAll(() => {
    return azurite.close();
  });

  describe("PUT Simple Container", () => {
    it("should create a container", () => {
      return chai
        .request(url)
        .put(`${urlPath}/${containerName}`)
        .query({ restype: "container" })
        .then((res) => {
          expect(res.status).to.equal(201);
        });
    });
    it("and a second with the same name that fails", () => {
      return chai
        .request(url)
        .put(`${urlPath}/${containerName}`)
        .query({ restype: "container" })
        .catch((e) => {
          e.should.have.status(409);
        });
    });
  });
  describe("DELETE Simple Container", () => {
    it("successfully deletes the container", () => {
      return chai
        .request(url)
        .delete(`${urlPath}/${containerName}`)
        .query({ restype: "container" })
        .then((res) => {
          expect(res.status).to.equal(202);
        });
    });
    it("deleting a non-existant container fails", () => {
      return chai
        .request(url)
        .delete(`${urlPath}/DOESNOTEXIST`)
        .query({ restype: "container" })
        .catch((e) => {
          e.should.have.status(404);
        });
    });
  });
  describe("Container Metadata", () => {
    it("should update an existing container with metadata.", () => {
      return chai
        .request(url)
        .put(`${urlPath}/${propContainer}`)
        .query({ restype: "container", comp: "metadata" })
        .set("x-ms-meta-test1", "value1")
        .set("x-ms-meta-test2", "value2")
        .set("x-ms-meta-meta1", "meta1Value")
        .then((res) => {
          expect(res.status).to.equal(200);
        });
    });
    it("should get the correct metadata. (GET)", () => {
      return chai
        .request(url)
        .get(`${urlPath}/${propContainer}`)
        .query({ restype: "container", comp: "metadata" })
        .then((res) => {
          expect(res.status).to.equal(200);
          expect(res.header["x-ms-meta-test1"]).to.equal("value1");
          expect(res.header["x-ms-meta-test2"]).to.equal("value2");
          expect(res.header["x-ms-meta-meta1"]).to.equal("meta1Value");
          expect(res.header["last-modified"]).to.not.be.null;
          expect(res.header["etag"]).to.not.be.null;
        });
    });
    it("should get the correct metadata. (HEAD)", () => {
      return chai
        .request(url)
        .head(`${urlPath}/${propContainer}`)
        .query({ restype: "container", comp: "metadata" })
        .then((res) => {
          expect(res.status).to.equal(200);
          expect(res.header["x-ms-meta-test1"]).to.equal("value1");
          expect(res.header["x-ms-meta-test2"]).to.equal("value2");
          expect(res.header["x-ms-meta-meta1"]).to.equal("meta1Value");
          expect(res.header["last-modified"]).to.not.be.null;
          expect(res.header["etag"]).to.not.be.null;
        });
    });
    it("should fail to get metadata of a non-existant container (GET)", () => {
      return chai
        .request(url)
        .get(`${urlPath}/CONTAINER_DOESNOTEXIST`)
        .query({ restype: "container", comp: "metadata" })
        .catch((e) => {
          e.should.have.status(404);
        });
    });
    it("should fail to get metadata of a non-existant container (HEAD)", () => {
      return chai
        .request(url)
        .head(`${urlPath}/CONTAINER_DOESNOTEXIST`)
        .query({ restype: "container", comp: "metadata" })
        .catch((e) => {
          e.should.have.status(404);
        });
    });
  });
  describe("Container System Properties", () => {
    it("should update an existing container with metadata.", () => {
      return chai
        .request(url)
        .put(`${urlPath}/${propContainer}`)
        .query({ restype: "container", comp: "metadata" })
        .set("x-ms-meta-test1", "value1")
        .set("x-ms-meta-test2", "value2")
        .set("x-ms-meta-meta1", "meta1Value")
        .then((res) => {
          expect(res.status).to.equal(200);
        });
    });
    it("should get the correct metadata. (GET)", () => {
      return chai
        .request(url)
        .get(`${urlPath}/${propContainer}`)
        .query({ restype: "container" })
        .then((res) => {
          expect(res.status).to.equal(200);
          expect(res.header["x-ms-meta-test1"]).to.equal("value1");
          expect(res.header["x-ms-meta-test2"]).to.equal("value2");
          expect(res.header["x-ms-meta-meta1"]).to.equal("meta1Value");
          expect(res.header["last-modified"]).to.not.be.null;
          expect(res.header["etag"]).to.not.be.null;
        });
    });
    it("should get the correct metadata. (HEAD)", () => {
      return chai
        .request(url)
        .head(`${urlPath}/${propContainer}`)
        .query({ restype: "container" })
        .then((res) => {
          expect(res.status).to.equal(200);
          expect(res.header["x-ms-meta-test1"]).to.equal("value1");
          expect(res.header["x-ms-meta-test2"]).to.equal("value2");
          expect(res.header["x-ms-meta-meta1"]).to.equal("meta1Value");
          expect(res.header["last-modified"]).to.not.be.null;
          expect(res.header["etag"]).to.not.be.null;
        });
    });
    it("should fail to get metadata of a non-existant container (GET)", () => {
      return chai
        .request(url)
        .get(`${urlPath}/CONTAINER_DOESNOTEXIST`)
        .query({ restype: "container" })
        .catch((e) => {
          e.should.have.status(404);
        });
    });
    it("should fail to get metadata of a non-existant container (HEAD)", () => {
      return chai
        .request(url)
        .head(`${urlPath}/CONTAINER_DOESNOTEXIST`)
        .query({ restype: "container" })
        .catch((e) => {
          e.should.have.status(404);
        });
    });
  });
});
