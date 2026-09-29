/**
 * Unit tests for DFS ACL enforcement logic.
 *
 * These test the pure ACL evaluation algorithm without requiring a running
 * server or real JWT tokens. The enforcer is invoked by PathHandler when
 * --oauth acl is enabled (Phase III).
 */

import * as assert from "assert";
import {
  checkAcl,
  parseAcl,
  AclPermission
} from "../../src/blob/dfs/DfsAclEnforcer";
import { IDfsAuthenticatedIdentity } from "../../src/blob/dfs/DfsContext";

describe("DFS ACL Enforcer", () => {

  describe("parseAcl", () => {
    it("parses a valid ACL string", () => {
      const acl = parseAcl("user::rwx,user:abc-123:r-x,group::r--,mask::rwx,other::---");
      assert.strictEqual(acl.length, 5);

      assert.strictEqual(acl[0].type, "user");
      assert.strictEqual(acl[0].entityId, "");
      assert.strictEqual(acl[0].read, true);
      assert.strictEqual(acl[0].write, true);
      assert.strictEqual(acl[0].execute, true);

      assert.strictEqual(acl[1].type, "user");
      assert.strictEqual(acl[1].entityId, "abc-123");
      assert.strictEqual(acl[1].read, true);
      assert.strictEqual(acl[1].write, false);
      assert.strictEqual(acl[1].execute, true);

      assert.strictEqual(acl[3].type, "mask");
      assert.strictEqual(acl[4].type, "other");
      assert.strictEqual(acl[4].read, false);
    });

    it("returns empty array for undefined", () => {
      assert.deepStrictEqual(parseAcl(undefined), []);
    });

    it("returns empty array for empty string", () => {
      assert.deepStrictEqual(parseAcl(""), []);
    });
  });

  describe("checkAcl — bypass scenarios", () => {
    it("bypasses when no identity (emulator mode)", () => {
      const result = checkAcl(undefined, "owner1", "group1", "rwxr-x---", undefined, "r");
      assert.strictEqual(result.allowed, true);
      assert.ok(result.reason.includes("emulator mode"));
    });

    it("denies (fails closed) when an authenticated identity has no oid or upn", () => {
      // A Bearer token was presented and accepted, but carries no oid/upn
      // claim. Since BlobTokenAuthenticator does not validate signatures,
      // treating this as an emulator-mode bypass would let a caller disable
      // ACL enforcement simply by omitting these claims — so it must be denied.
      const identity: IDfsAuthenticatedIdentity = {};
      const result = checkAcl(identity, "owner1", "group1", "rwxr-x---", undefined, "r");
      assert.strictEqual(result.allowed, false);
      assert.ok(result.reason.includes("oid/upn"));
    });

    it("does not bypass just because the stored owner is $superuser", () => {
      // The caller ("user1") is not $superuser and does not match the
      // stored owner/group; $superuser-as-owner is not itself a bypass —
      // only an actual $superuser *caller* bypasses (see the test below).
      // Falls through to "other" permissions, which are "---" here.
      const identity: IDfsAuthenticatedIdentity = { oid: "user1" };
      const result = checkAcl(identity, "$superuser", "$superuser", "rwxr-x---", undefined, "r");
      assert.strictEqual(result.allowed, false);
    });

    it("$superuser caller bypasses regardless of stored owner", () => {
      const identity: IDfsAuthenticatedIdentity = { oid: "$superuser" };
      const result = checkAcl(identity, "owner1", "group1", "rwxr-x---", undefined, "r");
      assert.strictEqual(result.allowed, true);
      assert.ok(result.reason.includes("$superuser"));
    });

    it("does not bypass when owner is undefined (defaults to $superuser) for a non-superuser caller", () => {
      // Default owner/group of "$superuser" with default permissions
      // "rwxr-x---" denies "other" access, and this caller is neither the
      // owner nor $superuser, so the request must be denied, not bypassed.
      const identity: IDfsAuthenticatedIdentity = { oid: "user1" };
      const result = checkAcl(identity, undefined, undefined, undefined, undefined, "r");
      assert.strictEqual(result.allowed, false);
    });
  });

  describe("checkAcl — owner permissions", () => {
    it("allows owner with read permission", () => {
      const identity: IDfsAuthenticatedIdentity = { oid: "owner1" };
      const result = checkAcl(identity, "owner1", "group1", "r-x------", undefined, "r");
      assert.strictEqual(result.allowed, true);
      assert.ok(result.reason.includes("Owner"));
    });

    it("denies owner without write permission", () => {
      const identity: IDfsAuthenticatedIdentity = { oid: "owner1" };
      const result = checkAcl(identity, "owner1", "group1", "r-x------", undefined, "w");
      assert.strictEqual(result.allowed, false);
    });

    it("allows owner with full rwx permissions", () => {
      const identity: IDfsAuthenticatedIdentity = { oid: "owner1" };
      for (const perm of ["r", "w", "x"] as AclPermission[]) {
        const result = checkAcl(identity, "owner1", "group1", "rwx------", undefined, perm);
        assert.strictEqual(result.allowed, true, `Expected owner to have ${perm}`);
      }
    });
  });

  describe("checkAcl — named user ACL entries", () => {
    it("allows named user with matching ACL entry", () => {
      const identity: IDfsAuthenticatedIdentity = { oid: "user-abc" };
      const acl = "user::rwx,user:user-abc:r-x,group::r--,other::---";
      const result = checkAcl(identity, "owner1", "group1", "rwxr-----", acl, "r");
      assert.strictEqual(result.allowed, true);
      assert.ok(result.reason.includes("Named user"));
    });

    it("denies named user without required permission", () => {
      const identity: IDfsAuthenticatedIdentity = { oid: "user-abc" };
      const acl = "user::rwx,user:user-abc:r--,group::r--,other::---";
      const result = checkAcl(identity, "owner1", "group1", "rwxr-----", acl, "w");
      assert.strictEqual(result.allowed, false);
    });

    it("applies mask to named user permissions", () => {
      const identity: IDfsAuthenticatedIdentity = { oid: "user-abc" };
      // user has rwx but mask limits to r--
      const acl = "user::rwx,user:user-abc:rwx,mask::r--,group::r--,other::---";
      const result = checkAcl(identity, "owner1", "group1", "rwxr-----", acl, "w");
      assert.strictEqual(result.allowed, false); // mask denies write
    });
  });

  describe("checkAcl — other permissions", () => {
    it("falls through to other permissions for unknown user", () => {
      const identity: IDfsAuthenticatedIdentity = { oid: "stranger" };
      const result = checkAcl(identity, "owner1", "group1", "rwxr-xr--", undefined, "r");
      assert.strictEqual(result.allowed, true);
      assert.ok(result.reason.includes("Other"));
    });

    it("denies stranger when other has no permissions", () => {
      const identity: IDfsAuthenticatedIdentity = { oid: "stranger" };
      const result = checkAcl(identity, "owner1", "group1", "rwxr-x---", undefined, "r");
      assert.strictEqual(result.allowed, false);
    });

    it("allows stranger when other has read", () => {
      const identity: IDfsAuthenticatedIdentity = { oid: "stranger" };
      const result = checkAcl(identity, "owner1", "group1", "------r--", undefined, "r");
      assert.strictEqual(result.allowed, true);
    });
  });

  describe("checkAcl — group permissions", () => {
    it("allows group member with group permissions", () => {
      const identity: IDfsAuthenticatedIdentity = { oid: "group1" };
      const result = checkAcl(identity, "owner1", "group1", "---rwx---", undefined, "r");
      assert.strictEqual(result.allowed, true);
      assert.ok(result.reason.includes("Group"));
    });

    it("denies group member without required permission", () => {
      const identity: IDfsAuthenticatedIdentity = { oid: "group1" };
      const result = checkAcl(identity, "owner1", "group1", "------r--", undefined, "r");
      // group perms are chars 3-5 = "---" → denied, falls to other = "r--"
      // Actually the caller matches group so it checks group perms first
      // chars 3-5 = "---" → denied
      assert.strictEqual(result.allowed, false);
    });
  });

  describe("checkAcl — UPN matching", () => {
    it("matches identity by upn when oid is not set", () => {
      const identity: IDfsAuthenticatedIdentity = { upn: "user@example.com" };
      const result = checkAcl(identity, "user@example.com", "group1", "rwx------", undefined, "r");
      assert.strictEqual(result.allowed, true);
      assert.ok(result.reason.includes("Owner"));
    });
  });
});
