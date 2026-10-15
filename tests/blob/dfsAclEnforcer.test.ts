/**
 * Unit tests for DFS ACL enforcement logic.
 *
 * These test the pure ACL evaluation algorithm without requiring a running
 * server or real JWT tokens. The enforcer is invoked by PathHandler when
 * --oauth acl is enabled (Phase III).
 */

import * as assert from "assert";
import {
  aclWithPermissions,
  applyUmask,
  checkAcl,
  isValidAcl,
  isValidUmask,
  normalizePermissions,
  parseAcl,
  permissionsFromAcl,
  AclPermission
} from "../../src/blob/dfs/DfsAclEnforcer";
import { IDfsAuthenticatedIdentity } from "../../src/blob/dfs/DfsContext";

describe("DFS ACL Enforcer @loki", () => {

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

  describe("checkAcl — base ACL entries", () => {
    it("denies other when the ACL other entry denies it without a permission string", () => {
      const identity: IDfsAuthenticatedIdentity = { oid: "stranger" };
      const result = checkAcl(identity, "owner1", "group1", undefined, "user::---,group::---,other::---", "r");
      assert.strictEqual(result.allowed, false);
    });

    it("uses the ACL owner entry over the default permissions", () => {
      const identity: IDfsAuthenticatedIdentity = { oid: "owner1" };
      const acl = "user::r--,group::---,other::---";
      assert.strictEqual(checkAcl(identity, "owner1", "group1", undefined, acl, "r").allowed, true);
      assert.strictEqual(checkAcl(identity, "owner1", "group1", undefined, acl, "w").allowed, false);
    });

    it("uses the ACL group entry, limited by the mask", () => {
      const identity: IDfsAuthenticatedIdentity = { oid: "group1" };
      const acl = "user::rwx,group::rwx,mask::r--,other::---";
      assert.strictEqual(checkAcl(identity, "owner1", "group1", "---------", acl, "r").allowed, true);
      assert.strictEqual(checkAcl(identity, "owner1", "group1", "---------", acl, "w").allowed, false);
    });

    it("grants other from the ACL other entry", () => {
      const identity: IDfsAuthenticatedIdentity = { oid: "stranger" };
      const result = checkAcl(identity, "owner1", "group1", "rwx------", "user::rwx,group::---,other::r--", "r");
      assert.strictEqual(result.allowed, true);
    });
  });

  describe("permission string and ACL synchronization", () => {
    it("derives the permission string from the base ACL entries", () => {
      assert.strictEqual(permissionsFromAcl("user::rw-,user:abc:r--,group::r--,other::---", undefined), "rw-r-----");
    });

    it("keeps the current bits of base entries missing from the ACL", () => {
      assert.strictEqual(permissionsFromAcl("user::r--", "rwxr-xr-x"), "r--r-xr-x");
    });

    it("rewrites the base ACL entries from a permission string", () => {
      assert.strictEqual(
        aclWithPermissions("user::rwx,user:abc:r--,group::r-x,mask::r-x,other::---", "rw-r---wx"),
        "user::rw-,user:abc:r--,group::r--,mask::r-x,other::-wx"
      );
    });
  });

  describe("permission and ACL header validation", () => {
    it("accepts symbolic permissions, with a sticky bit or a trailing +", () => {
      assert.strictEqual(normalizePermissions("rwxr-x---"), "rwxr-x---");
      assert.strictEqual(normalizePermissions("rwxrwxrwt"), "rwxrwxrwt");
      assert.strictEqual(normalizePermissions("rwxr-x---+"), "rwxr-x---+");
    });

    it("converts octal permissions to the symbolic notation", () => {
      assert.strictEqual(normalizePermissions("0750"), "rwxr-x---");
      assert.strictEqual(normalizePermissions("1777"), "rwxrwxrwt");
      assert.strictEqual(normalizePermissions("1776"), "rwxrwxrwT");
    });

    it("rejects malformed permissions", () => {
      for (const value of ["", "rwx", "rwxrwxrwxx", "abcdefghi", "777", "0778"]) {
        assert.strictEqual(normalizePermissions(value), undefined, `Expected ${value} to be rejected`);
      }
    });

    it("applies a umask", () => {
      assert.strictEqual(applyUmask("rwxrwxrwx", "0027"), "rwxr-x---");
      assert.strictEqual(applyUmask("rw-rw-rw-", "0022"), "rw-r--r--");
      assert.strictEqual(isValidUmask("0027"), true);
      assert.strictEqual(isValidUmask("027"), false);
    });

    it("validates ACL entries", () => {
      assert.strictEqual(isValidAcl("user::rwx,user:abc:r-x,group::r--,mask::r-x,other::---,default:user::rwx"), true);
      assert.strictEqual(isValidAcl("user::rwz"), false);
      assert.strictEqual(isValidAcl("user::rwx,"), false);
      assert.strictEqual(isValidAcl("owner::rwx"), false);
      assert.strictEqual(isValidAcl("other:abc:r--"), false);
      assert.strictEqual(isValidAcl("user::rwx", false), false);
      assert.strictEqual(isValidAcl("user:abc,group::", false), true);
    });

    it("ignores default ACL entries when checking access", () => {
      const identity: IDfsAuthenticatedIdentity = { oid: "stranger" };
      const result = checkAcl(identity, "owner1", "group1", undefined, "user::rwx,group::---,other::---,default:other::rwx", "r");
      assert.strictEqual(result.allowed, false);
    });

    it("treats the sticky bit t as execute", () => {
      const identity: IDfsAuthenticatedIdentity = { oid: "stranger" };
      assert.strictEqual(checkAcl(identity, "owner1", "group1", "rwxrwxrwt", undefined, "x").allowed, true);
      assert.strictEqual(checkAcl(identity, "owner1", "group1", "rwxrwxrwT", undefined, "x").allowed, false);
    });
  });
});
