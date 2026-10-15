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
  BlobServiceClient,
  generateAccountSASQueryParameters,
  newPipeline,
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
    new Date("2019-01-01T00:00:00Z"),
    new Date("2019-01-01T00:00:00Z"),
    new Date("2100-01-01T00:00:00Z"),
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

  it("allows read when user OID matches named user ACL entry @loki @sql", async () => {
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

  it("allows write when user is owner @loki @sql", async () => {
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

  it("denies file create when caller lacks write on parent directory @loki @sql", async () => {
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

  it("SAS requests bypass ACL enforcement entirely @loki @sql", async () => {
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

  it("denies lease acquisition when caller lacks write ACL @loki @sql", async () => {
    const fs = getUniqueName("aclfs");

    await sasRequest("PUT", url(fs, undefined, "resource=filesystem"));
    await sasRequest("PUT", url(fs, "leased.txt", "resource=file"));

    // Owner is TEST_OID with rw-; OTHER_OID has no write permission
    await sasRequest("PATCH", url(fs, "leased.txt", "action=setAccessControl"), {
      "x-ms-owner": TEST_OID,
      "x-ms-acl": "user::rw-,group::---,other::---"
    });

    // OTHER_OID cannot acquire a lease (requires write permission).
    // DFS lease requests use POST with no query resource/action — just the
    // x-ms-lease-action header (see BlobRequestListenerFactory's DFS routing).
    const denied = await bearerRequest(
      "POST",
      `https://${host}:${port}/${EMULATOR_ACCOUNT_NAME}/${fs}/leased.txt`,
      OTHER_OID,
      { "x-ms-lease-action": "acquire", "x-ms-lease-duration": "-1" }
    );
    assert.strictEqual(denied.status, 403, `Expected non-owner lease acquire to be denied, got ${denied.status}`);

    // TEST_OID (owner) can acquire the lease
    const allowed = await bearerRequest(
      "POST",
      `https://${host}:${port}/${EMULATOR_ACCOUNT_NAME}/${fs}/leased.txt`,
      TEST_OID,
      { "x-ms-lease-action": "acquire", "x-ms-lease-duration": "-1" }
    );
    assert.strictEqual(allowed.status, 201, `Expected owner lease acquire to be allowed, got ${allowed.status}`);

    await sasRequest("DELETE", url(fs, undefined, "resource=filesystem"));
  });

  it("denies a non-owner caller from reassigning x-ms-owner via setAccessControl @loki @sql", async () => {
    const fs = getUniqueName("aclfs");

    await sasRequest("PUT", url(fs, undefined, "resource=filesystem"));
    await sasRequest("PUT", url(fs, "owned.txt", "resource=file"));

    // TEST_OID is owner with full rwx; OTHER_OID has rw- (write, but not ownership)
    await sasRequest("PATCH", url(fs, "owned.txt", "action=setAccessControl"), {
      "x-ms-owner": TEST_OID,
      "x-ms-acl": "user::rwx,group::---,other::rw-"
    });

    // OTHER_OID has write permission (via "other::rw-") but is not the owner —
    // must not be able to reassign ownership to itself.
    const denied = await bearerRequest(
      "PATCH",
      `https://${host}:${port}/${EMULATOR_ACCOUNT_NAME}/${fs}/owned.txt?action=setAccessControl`,
      OTHER_OID,
      { "x-ms-owner": OTHER_OID }
    );
    assert.strictEqual(denied.status, 403, `Expected non-owner owner-reassignment to be denied, got ${denied.status}`);

    // TEST_OID (current owner) can still reassign ownership
    const allowed = await bearerRequest(
      "PATCH",
      `https://${host}:${port}/${EMULATOR_ACCOUNT_NAME}/${fs}/owned.txt?action=setAccessControl`,
      TEST_OID,
      { "x-ms-owner": OTHER_OID }
    );
    assert.strictEqual(allowed.status, 200, `Expected owner-initiated reassignment to succeed, got ${allowed.status}`);

    await sasRequest("DELETE", url(fs, undefined, "resource=filesystem"));
  });

  it("does not bypass ACL enforcement for a Bearer request carrying a sig query parameter @loki @sql", async () => {
    const fs = getUniqueName("aclfs");

    await sasRequest("PUT", url(fs, undefined, "resource=filesystem"));
    await sasRequest("PUT", url(fs, "locked.txt", "resource=file"));
    await sasRequest("PATCH", url(fs, "locked.txt", "action=setAccessControl"), {
      "x-ms-owner": "$superuser",
      "x-ms-acl": "user::---,group::---,other::---"
    });

    const res = await bearerRequest(
      "HEAD",
      `https://${host}:${port}/${EMULATOR_ACCOUNT_NAME}/${fs}/locked.txt?sig=bogus`,
      OTHER_OID
    );
    assert.strictEqual(res.status, 403, `Expected the Bearer request to be denied, got ${res.status}`);

    await sasRequest("DELETE", url(fs, undefined, "resource=filesystem"));
  });

  it("authorizes top-level paths against the default root ACL @loki @sql", async () => {
    const fs = getUniqueName("aclfs");

    await sasRequest("PUT", url(fs, undefined, "resource=filesystem"));

    const denied = await bearerRequest(
      "PUT",
      `https://${host}:${port}/${EMULATOR_ACCOUNT_NAME}/${fs}/top.txt?resource=file`,
      OTHER_OID
    );
    assert.strictEqual(denied.status, 403, `Expected a root create to be denied, got ${denied.status}`);

    const deniedNested = await bearerRequest(
      "PUT",
      `https://${host}:${port}/${EMULATOR_ACCOUNT_NAME}/${fs}/missing/nested.txt?resource=file`,
      OTHER_OID
    );
    assert.strictEqual(deniedNested.status, 403, `Expected a create under a missing directory to be denied, got ${deniedNested.status}`);

    const allowed = await bearerRequest(
      "PUT",
      `https://${host}:${port}/${EMULATOR_ACCOUNT_NAME}/${fs}/top.txt?resource=file`,
      "$superuser"
    );
    assert.strictEqual(allowed.status, 201, `Expected $superuser to create at the root, got ${allowed.status}`);

    await sasRequest("DELETE", url(fs, undefined, "resource=filesystem"));
  });

  it("authorizes delete against the parent directory @loki @sql", async () => {
    const fs = getUniqueName("aclfs");

    await sasRequest("PUT", url(fs, undefined, "resource=filesystem"));
    await sasRequest("PUT", url(fs, "dir", "resource=directory"));
    await sasRequest("PUT", url(fs, "dir/file.txt", "resource=file"));

    // OTHER_OID owns the file but has no permission on its directory
    await sasRequest("PATCH", url(fs, "dir", "action=setAccessControl"), {
      "x-ms-owner": TEST_OID,
      "x-ms-acl": "user::rwx,group::---,other::---"
    });
    await sasRequest("PATCH", url(fs, "dir/file.txt", "action=setAccessControl"), {
      "x-ms-owner": OTHER_OID,
      "x-ms-acl": "user::---,group::---,other::---"
    });

    const fileUrl = `https://${host}:${port}/${EMULATOR_ACCOUNT_NAME}/${fs}/dir/file.txt`;
    const denied = await bearerRequest("DELETE", fileUrl, OTHER_OID);
    assert.strictEqual(denied.status, 403, `Expected the file owner without parent permission to be denied, got ${denied.status}`);

    // TEST_OID has no permission on the file, but write and execute on its directory
    const allowed = await bearerRequest("DELETE", fileUrl, TEST_OID);
    assert.strictEqual(allowed.status, 200, `Expected the directory owner to delete, got ${allowed.status}`);

    await sasRequest("DELETE", url(fs, undefined, "resource=filesystem"));
  });

  it("authorizes a rename to a new path against the destination parent directory @loki @sql", async () => {
    const fs = getUniqueName("aclfs");

    await sasRequest("PUT", url(fs, undefined, "resource=filesystem"));
    await sasRequest("PUT", url(fs, "src", "resource=directory"));
    await sasRequest("PUT", url(fs, "src/file.txt", "resource=file"));
    await sasRequest("PUT", url(fs, "locked", "resource=directory"));

    await sasRequest("PATCH", url(fs, "src", "action=setAccessControl"), {
      "x-ms-owner": TEST_OID,
      "x-ms-acl": "user::rwx,group::---,other::---"
    });
    await sasRequest("PATCH", url(fs, "locked", "action=setAccessControl"), {
      "x-ms-owner": "$superuser",
      "x-ms-acl": "user::rwx,group::---,other::r-x"
    });

    const denied = await bearerRequest(
      "PUT",
      `https://${host}:${port}/${EMULATOR_ACCOUNT_NAME}/${fs}/locked/file.txt`,
      TEST_OID,
      { "x-ms-rename-source": `/${EMULATOR_ACCOUNT_NAME}/${fs}/src/file.txt` }
    );
    assert.strictEqual(denied.status, 403, `Expected the rename into a read-only directory to be denied, got ${denied.status}`);

    const allowed = await bearerRequest(
      "PUT",
      `https://${host}:${port}/${EMULATOR_ACCOUNT_NAME}/${fs}/src/renamed.txt`,
      TEST_OID,
      { "x-ms-rename-source": `/${EMULATOR_ACCOUNT_NAME}/${fs}/src/file.txt` }
    );
    assert.strictEqual(allowed.status, 201, `Expected the rename within the owned directory to succeed, got ${allowed.status}`);

    await sasRequest("DELETE", url(fs, undefined, "resource=filesystem"));
  });

  it("evaluates ACLs for Bearer requests on a container allowing public access @loki @sql", async () => {
    const fs = getUniqueName("aclfs");

    await sasRequest("PUT", url(fs, undefined, "resource=filesystem"));
    await sasRequest("PUT", url(fs, "locked.txt", "resource=file"));
    await sasRequest("PATCH", url(fs, "locked.txt", "action=setAccessControl"), {
      "x-ms-owner": "$superuser",
      "x-ms-acl": "user::---,group::---,other::---"
    });

    // Allow anonymous read access on the container through the Blob API
    await new BlobServiceClient(
      baseUrl,
      newPipeline(new StorageSharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY), {
        retryOptions: { maxTries: 1 },
        keepAliveOptions: { enable: false }
      })
    ).getContainerClient(fs).setAccessPolicy("container");

    const res = await bearerRequest(
      "HEAD",
      `https://${host}:${port}/${EMULATOR_ACCOUNT_NAME}/${fs}/locked.txt`,
      OTHER_OID
    );
    assert.strictEqual(res.status, 403, `Expected the Bearer request to be denied, got ${res.status}`);

    await sasRequest("DELETE", url(fs, undefined, "resource=filesystem"));
  });

  it("evaluates ACLs for Bearer requests that also carry a valid SAS @loki @sql", async () => {
    const fs = getUniqueName("aclfs");

    await sasRequest("PUT", url(fs, undefined, "resource=filesystem"));
    await sasRequest("PUT", url(fs, "locked.txt", "resource=file"));
    await sasRequest("PATCH", url(fs, "locked.txt", "action=setAccessControl"), {
      "x-ms-owner": "$superuser",
      "x-ms-acl": "user::---,group::---,other::---"
    });

    const res = await bearerRequest("HEAD", url(fs, "locked.txt"), OTHER_OID);
    assert.strictEqual(res.status, 403, `Expected the Bearer request to be denied, got ${res.status}`);

    await sasRequest("DELETE", url(fs, undefined, "resource=filesystem"));
  });

  it("only lets the owner change the ACL or permissions of a path @loki @sql", async () => {
    const fs = getUniqueName("aclfs");

    await sasRequest("PUT", url(fs, undefined, "resource=filesystem"));
    await sasRequest("PUT", url(fs, "shared.txt", "resource=file"));

    // OTHER_OID can write the file, but doesn't own it
    await sasRequest("PATCH", url(fs, "shared.txt", "action=setAccessControl"), {
      "x-ms-owner": TEST_OID,
      "x-ms-acl": "user::rwx,group::---,other::rw-"
    });

    const fileUrl = `https://${host}:${port}/${EMULATOR_ACCOUNT_NAME}/${fs}/shared.txt?action=setAccessControl`;
    const changes: Record<string, string>[] = [
      { "x-ms-acl": `user::rwx,user:${OTHER_OID}:rwx,group::---,other::rw-` },
      { "x-ms-permissions": "rwxrwxrwx" },
      { "x-ms-group": OTHER_OID }
    ];
    for (const headers of changes) {
      const denied = await bearerRequest("PATCH", fileUrl, OTHER_OID, headers);
      assert.strictEqual(denied.status, 403, `Expected ${JSON.stringify(headers)} to be denied, got ${denied.status}`);
    }

    const allowed = await bearerRequest("PATCH", fileUrl, TEST_OID, { "x-ms-permissions": "rwxrwxrwx" });
    assert.strictEqual(allowed.status, 200, `Expected the owner to change the permissions, got ${allowed.status}`);

    await sasRequest("DELETE", url(fs, undefined, "resource=filesystem"));
  });

  it("evaluates the default root ACL when listing the filesystem root @loki @sql", async () => {
    const fs = getUniqueName("aclfs");

    await sasRequest("PUT", url(fs, undefined, "resource=filesystem"));
    await sasRequest("PUT", url(fs, "file.txt", "resource=file"));

    const listUrl = `https://${host}:${port}/${EMULATOR_ACCOUNT_NAME}/${fs}?resource=filesystem&recursive=false`;
    const denied = await bearerRequest("GET", listUrl, OTHER_OID);
    assert.strictEqual(denied.status, 403, `Expected the root listing to be denied, got ${denied.status}`);

    const allowed = await bearerRequest("GET", listUrl, "$superuser");
    assert.strictEqual(allowed.status, 200, `Expected $superuser to list the root, got ${allowed.status}`);

    await sasRequest("DELETE", url(fs, undefined, "resource=filesystem"));
  });

  it("treats a lowercase bearer scheme as a Bearer request @loki @sql", async () => {
    const fs = getUniqueName("aclfs");

    await sasRequest("PUT", url(fs, undefined, "resource=filesystem"));
    await sasRequest("PUT", url(fs, "locked.txt", "resource=file"));
    await sasRequest("PATCH", url(fs, "locked.txt", "action=setAccessControl"), {
      "x-ms-owner": "$superuser",
      "x-ms-acl": "user::---,group::---,other::---"
    });

    const res = await axios.request({
      method: "HEAD",
      url: url(fs, "locked.txt"),
      headers: {
        "x-ms-version": "2025-11-05",
        "Authorization": `bearer ${makeToken(OTHER_OID)}`,
        "User-Agent": "azsdk-js/storage-file-datalake"
      },
      httpsAgent,
      validateStatus: () => true
    });
    assert.notStrictEqual(res.status, 200, "A lowercase bearer request with a SAS must not bypass the ACL");

    await sasRequest("DELETE", url(fs, undefined, "resource=filesystem"));
  });
});
