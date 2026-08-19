/**
 * End-to-end OAuth + ACL enforcement tests for the DFS (ADLS Gen2) endpoint.
 *
 * Starts an HTTPS server with --oauth acl and HNS enabled. Setup operations
 * (creating filesystems, files, setting ACLs) use SAS tokens, which are
 * signed via SharedKey and therefore bypass ACL enforcement (no identity).
 * Enforcement is then exercised by sending requests with Bearer tokens
 * carrying specific OID claims.
 */

import {
  AccountSASPermissions,
  AccountSASResourceTypes,
  AccountSASServices,
  generateAccountSASQueryParameters,
  SASProtocol,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import * as assert from "assert";
import axios from "axios";
import * as https from "https";

import { configLogger } from "../../src/common/Logger";
import BlobTestServerFactory from "../BlobTestServerFactory";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  generateJWTToken,
  getUniqueName
} from "../testutils";

configLogger(false);

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const TEST_OID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OTHER_OID = "11111111-2222-3333-4444-555555555555";

function makeToken(oid: string): string {
  return generateJWTToken(
    new Date("2019/01/01"),
    new Date("2019/01/01"),
    new Date("2100/01/01"),
    "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
    "https://storage.azure.com",
    "user_impersonation",
    oid,
    "dd0d0df1-06c3-436c-8034-4b9a153097ce"
  );
}

describe("DFS OAuth ACL enforcement", () => {
  const factory = new BlobTestServerFactory();
  const server = factory.createServer(false, true, true, "acl", true);
  const host = server.config.host;
  const port = server.config.port;
  const baseUrl = `https://${host}:${port}/${EMULATOR_ACCOUNT_NAME}`;

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

  function url(filesystem: string, path?: string, query?: string): string {
    const p = path ? `/${path}` : "";
    const q = query ? `?${query}&${sas}` : `?${sas}`;
    return `${baseUrl}/${filesystem}${p}${q}`;
  }

  async function sasRequest(method: string, endpoint: string, headers: Record<string, string> = {}, body?: any) {
    return axios.request({
      method, url: endpoint, data: body ?? null,
      headers: { "x-ms-version": "2025-11-05", "User-Agent": "azsdk-js/storage-file-datalake", ...headers },
      httpsAgent, validateStatus: () => true
    });
  }

  async function bearerRequest(method: string, endpoint: string, oid: string, headers: Record<string, string> = {}, body?: any) {
    return axios.request({
      method, url: endpoint, data: body ?? null,
      headers: {
        "x-ms-version": "2025-11-05",
        "Authorization": `Bearer ${makeToken(oid)}`,
        "User-Agent": "azsdk-js/storage-file-datalake",
        ...headers
      },
      httpsAgent, validateStatus: () => true
    });
  }

  before(async () => { await server.start(); });
  after(async () => { await server.close(); await server.clean(); });

  it("allows read when user OID matches named user ACL entry @loki", async () => {
    const fs = getUniqueName("aclfs");

    // Create filesystem + file via SAS (bypasses ACL enforcement — no identity)
    await sasRequest("PUT", url(fs, undefined, "resource=filesystem"));
    await sasRequest("PUT", url(fs, "data.txt", "resource=file"));
    await sasRequest("PATCH", url(fs, "data.txt", "action=append&position=0"),
      { "Content-Type": "application/octet-stream" }, "hello");
    await sasRequest("PATCH", url(fs, "data.txt", "action=flush&position=5"));

    // Set ACL: deny owner/group/other, but allow TEST_OID named user read
    await sasRequest("PATCH", url(fs, "data.txt", "action=setAccessControl"), {
      "x-ms-owner": "$superuser",
      "x-ms-group": "$superuser",
      "x-ms-acl": `user::---,user:${TEST_OID}:r--,group::---,other::---`
    });

    // TEST_OID can read (has r-- on file)
    const allowed = await bearerRequest("GET", `https://${host}:${port}/${EMULATOR_ACCOUNT_NAME}/${fs}/data.txt`, TEST_OID);
    assert.strictEqual(allowed.status, 200, `Expected TEST_OID read to be allowed, got ${allowed.status}`);

    // OTHER_OID is denied (falls through to other::---)
    const denied = await bearerRequest("GET", `https://${host}:${port}/${EMULATOR_ACCOUNT_NAME}/${fs}/data.txt`, OTHER_OID);
    assert.strictEqual(denied.status, 403, `Expected OTHER_OID read to be denied, got ${denied.status}`);

    await sasRequest("DELETE", url(fs, undefined, "resource=filesystem"));
  });

  it("allows write when user is owner @loki", async () => {
    const fs = getUniqueName("aclfs");

    await sasRequest("PUT", url(fs, undefined, "resource=filesystem"));
    await sasRequest("PUT", url(fs, "writable.txt", "resource=file"));

    // Make TEST_OID the owner with rw- permissions; deny others
    await sasRequest("PATCH", url(fs, "writable.txt", "action=setAccessControl"), {
      "x-ms-owner": TEST_OID,
      "x-ms-acl": "user::rw-,group::---,other::---"
    });

    // Owner can append (write)
    const allowed = await bearerRequest(
      "PATCH",
      `https://${host}:${port}/${EMULATOR_ACCOUNT_NAME}/${fs}/writable.txt?action=append&position=0`,
      TEST_OID,
      { "Content-Type": "application/octet-stream" },
      "data"
    );
    assert.strictEqual(allowed.status, 202, `Expected owner write to be allowed, got ${allowed.status}`);

    // Non-owner is denied
    const denied = await bearerRequest(
      "PATCH",
      `https://${host}:${port}/${EMULATOR_ACCOUNT_NAME}/${fs}/writable.txt?action=append&position=4`,
      OTHER_OID,
      { "Content-Type": "application/octet-stream" },
      "more"
    );
    assert.strictEqual(denied.status, 403, `Expected non-owner write to be denied, got ${denied.status}`);

    await sasRequest("DELETE", url(fs, undefined, "resource=filesystem"));
  });

  it("denies file create when caller lacks write on parent directory @loki", async () => {
    const fs = getUniqueName("aclfs");

    await sasRequest("PUT", url(fs, undefined, "resource=filesystem"));
    await sasRequest("PUT", url(fs, "dir", "resource=directory"));

    // Set ACL on dir: owner is TEST_OID with rwx, others have no write
    await sasRequest("PATCH", url(fs, "dir", "action=setAccessControl"), {
      "x-ms-owner": TEST_OID,
      "x-ms-acl": "user::rwx,group::r-x,other::r-x"
    });

    // TEST_OID (owner with w) can create a file inside dir
    const allowed = await bearerRequest(
      "PUT",
      `https://${host}:${port}/${EMULATOR_ACCOUNT_NAME}/${fs}/dir/new.txt?resource=file`,
      TEST_OID
    );
    assert.strictEqual(allowed.status, 201, `Expected owner to be allowed to create, got ${allowed.status}`);

    // OTHER_OID (other, no w) cannot create inside dir
    const denied = await bearerRequest(
      "PUT",
      `https://${host}:${port}/${EMULATOR_ACCOUNT_NAME}/${fs}/dir/forbidden.txt?resource=file`,
      OTHER_OID
    );
    assert.strictEqual(denied.status, 403, `Expected non-owner to be denied create, got ${denied.status}`);

    await sasRequest("DELETE", url(fs, undefined, "resource=filesystem"));
  });

  it("SAS requests bypass ACL enforcement entirely @loki", async () => {
    const fs = getUniqueName("aclfs");

    await sasRequest("PUT", url(fs, undefined, "resource=filesystem"));
    await sasRequest("PUT", url(fs, "locked.txt", "resource=file"));

    // ACL denies everyone
    await sasRequest("PATCH", url(fs, "locked.txt", "action=setAccessControl"), {
      "x-ms-owner": "$superuser",
      "x-ms-acl": "user::---,group::---,other::---"
    });

    // SAS request (no identity extracted) still succeeds
    const res = await sasRequest("HEAD", url(fs, "locked.txt"));
    assert.strictEqual(res.status, 200, `Expected SAS request to bypass ACL, got ${res.status}`);

    await sasRequest("DELETE", url(fs, undefined, "resource=filesystem"));
  });
});
