import axios from "axios";
import * as assert from "assert";
import {
  AccountSASPermissions,
  AccountSASResourceTypes,
  AccountSASServices,
  generateAccountSASQueryParameters,
  SASProtocol,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import BlobTestServerFactory from "../BlobTestServerFactory";
import BlobServer from "../../src/blob/BlobServer";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../testutils";

describe("DfsReproduction @loki", () => {
  const factory = new BlobTestServerFactory();
  const blobServer = factory.createServer(false, true, false, undefined, true);

  before(async () => {
    await blobServer.start();
  });

  after(async () => {
    await blobServer.close();
    await blobServer.clean();
  });

  const dfsBaseUrl = `http://${blobServer.config.host}:${blobServer.config.port}/${EMULATOR_ACCOUNT_NAME}`;

  const sas = generateAccountSASQueryParameters(
    {
      expiresOn: new Date(Date.now() + 60 * 60 * 1000),
      startsOn: new Date(Date.now() - 10 * 60 * 1000),
      permissions: AccountSASPermissions.parse("rwdlacupitfx"),
      resourceTypes: AccountSASResourceTypes.parse("sco").toString(),
      services: AccountSASServices.parse("b").toString(),
      protocol: SASProtocol.HttpsAndHttp
    },
    new StorageSharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY)
  ).toString();

  it("VERIFY FIX: getProperties should NOT crash when lastModified is a String", async () => {
    const fs = getUniqueName("fs-fix");
    const account = EMULATOR_ACCOUNT_NAME;

    await axios.put(`${dfsBaseUrl}/${fs}?resource=filesystem&${sas}`);

    const store = (blobServer as BlobServer).metadataStore as any;
    const coll = store.db.getCollection(store.CONTAINERS_COLLECTION);
    const doc = coll.findOne({ name: fs, accountName: account });

    // Simulate the "unhydrated" state (String instead of Date)
    doc.properties.lastModified = new Date().toISOString();
    coll.update(doc);

    // This should now SUCCEED (200) instead of crashing with 500
    const response = await axios({
      method: "HEAD",
      url: `${dfsBaseUrl}/${fs}?resource=filesystem&${sas}`,
      headers: { "User-Agent": "azsdk-js/storage-file-datalake" }
    });

    assert.strictEqual(response.status, 200, "Should now succeed with 200 OK");
    assert.ok(response.headers["last-modified"], "Response should contain last-modified header");
  });

  it("VERIFY FIX: appendData should NOT crash when body is an Object", async () => {
    const fs = getUniqueName("fs-append-fix");
    const file = "test.txt";

    await axios.put(`${dfsBaseUrl}/${fs}?resource=filesystem&${sas}`);
    await axios.put(`${dfsBaseUrl}/${fs}/${file}?resource=file&${sas}`);

    // This should now SUCCEED (202) instead of crashing with 500
    const response = await axios({
        method: "PATCH",
        url: `${dfsBaseUrl}/${fs}/${file}?action=append&position=0&${sas}`,
        headers: {
            "User-Agent": "azsdk-js/storage-file-datalake",
            "Content-Type": "application/octet-stream"
        },
        data: {}
    });

    assert.strictEqual(response.status, 202, "Should now succeed with 202 Accepted");
  });
});
