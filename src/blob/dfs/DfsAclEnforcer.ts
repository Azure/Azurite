/**
 * ACL Enforcement for DFS (ADLS Gen2) operations.
 *
 * Phase III: When --oauth acl is enabled, checks the caller's identity
 * against POSIX ACL entries stored on each path before allowing operations.
 *
 * ACL format follows Azure ADLS Gen2:
 *   "user::rwx,user:oid:r-x,group::r-x,other::---"
 *
 * Limitations (per wiki guidance):
 *   - No AAD group membership resolution
 *   - $superuser identity bypasses all ACL checks
 *   - Emulator mode (no identity) bypasses all checks
 */

import logger from "../../common/Logger";
import { IDfsAuthenticatedIdentity } from "./DfsContext";

/** Required permission for an operation */
export type AclPermission = "r" | "w" | "x";

/**
 * Maps DFS operations to the minimum required permission.
 *
 * NOTE: "setAccessControl" returns "w" like ordinary data/property writes.
 * Real Azure ADLS Gen2 treats changing a path's ACL as a stricter operation
 * than writing data (in practice: owning user or superuser) — this emulator
 * does not distinguish "write data/properties" from "write ACL" at the
 * permission-level, but setAccessControl() additionally enforces an
 * owner-or-$superuser check specifically for x-ms-owner reassignment (see
 * PathHandler.setAccessControl) to avoid the most severe privilege-escalation
 * case. Other ACL/permission changes are still gated only by this "w" check.
 */
export function getRequiredPermission(
  operationDescription: string
): AclPermission {
  switch (operationDescription) {
    case "read":
    case "getProperties":
    case "getAccessControl":
    case "listPaths":
      return "r";
    case "create":
    case "delete":
    case "update":
    case "setAccessControl":
    case "setProperties":
    case "rename":
    case "lease":
      return "w";
    case "listChildren":
      return "x";
    default:
      return "r";
  }
}

/**
 * Parsed ACL entry.
 * Format: "type:entityId:permissions"
 * Examples: "user::rwx", "user:abc-123:r-x", "group::r--", "other::---"
 */
export interface AclEntry {
  type: "user" | "group" | "mask" | "other";
  entityId: string; // empty string for default user/group/other
  read: boolean;
  write: boolean;
  execute: boolean;
}

/**
 * Parse an ACL string into structured entries.
 * ACL format: "user::rwx,user:abc:r-x,group::r-x,mask::rwx,other::---"
 */
export function parseAcl(aclString: string | undefined): AclEntry[] {
  if (!aclString) return [];

  return aclString.split(",").filter(Boolean).map(entry => {
    const parts = entry.split(":");
    if (parts.length < 3) return null;

    const type = parts[0] as AclEntry["type"];
    const entityId = parts[1];
    const perms = parts[2];

    return {
      type,
      entityId,
      read: perms.charAt(0) === "r",
      write: perms.charAt(1) === "w",
      execute: perms.charAt(2) === "x"
    };
  }).filter((e): e is AclEntry => e !== null);
}

/**
 * Check if an ACL entry grants the required permission.
 */
function entryHasPermission(entry: AclEntry, permission: AclPermission): boolean {
  switch (permission) {
    case "r": return entry.read;
    case "w": return entry.write;
    case "x": return entry.execute;
  }
}

/**
 * Default POSIX permissions applied to a path (and to the filesystem root)
 * that has no stored permissions.
 */
export const DEFAULT_DFS_PERMISSIONS = "rwxr-x---";

const BASE_ENTRY_OFFSETS: { [type: string]: number } = {
  user: 0,
  group: 3,
  other: 6
};

function permissionTriplet(entry: AclEntry): string {
  return (entry.read ? "r" : "-") + (entry.write ? "w" : "-") + (entry.execute ? "x" : "-");
}

/**
 * Resolve a base (owning user, owning group or other) entry. The `user::`,
 * `group::` and `other::` entries of the ACL win over the permission string,
 * so an ACL set without a separate x-ms-permissions header is still enforced.
 */
function resolveBaseEntry(
  type: "user" | "group" | "other",
  permissionsStr: string | undefined,
  aclEntries: AclEntry[]
): AclEntry {
  const aclEntry = aclEntries.find(e => e.type === type && e.entityId === "");
  if (aclEntry) {
    return aclEntry;
  }

  const perms = permissionsStr || DEFAULT_DFS_PERMISSIONS;
  const offset = BASE_ENTRY_OFFSETS[type];
  return {
    type,
    entityId: "",
    read: perms.charAt(offset) === "r",
    write: perms.charAt(offset + 1) === "w",
    execute: perms.charAt(offset + 2) === "x"
  };
}

/**
 * Compute the permission string matching the base entries of an ACL, keeping
 * the bits of the current permission string for base entries the ACL omits.
 */
export function permissionsFromAcl(
  aclStr: string,
  currentPermissions: string | undefined
): string {
  const aclEntries = parseAcl(aclStr);
  const current = (currentPermissions || DEFAULT_DFS_PERMISSIONS).substring(0, 9);
  return (["user", "group", "other"] as const)
    .map(type => {
      const entry = aclEntries.find(e => e.type === type && e.entityId === "");
      const offset = BASE_ENTRY_OFFSETS[type];
      return entry ? permissionTriplet(entry) : current.substring(offset, offset + 3);
    })
    .join("") + (currentPermissions || "").substring(9);
}

/**
 * Rewrite the base entries of an ACL so they match a permission string,
 * keeping its named user/group and mask entries.
 */
export function aclWithPermissions(
  aclStr: string,
  permissions: string
): string {
  return aclStr
    .split(",")
    .filter(Boolean)
    .map(entry => {
      const parts = entry.split(":");
      const offset = BASE_ENTRY_OFFSETS[parts[0]];
      if (parts.length < 3 || parts[1] !== "" || offset === undefined) {
        return entry;
      }
      return `${parts[0]}::${permissions.substring(offset, offset + 3)}`;
    })
    .join(",");
}

/**
 * Result of an ACL check.
 */
export interface AclCheckResult {
  allowed: boolean;
  reason: string;
}

/**
 * Check whether the given identity is authorized for the required permission
 * based on the path's ACL metadata.
 *
 * Algorithm follows the POSIX ACL evaluation order:
 *   1. If owner matches identity → use owner permissions
 *   2. If a named user entry matches identity → use that entry (masked)
 *   3. If group matches → use group permissions (masked)
 *   4. Fall through to other permissions
 *
 * Special cases:
 *   - $superuser always passes (emulator admin)
 *   - No identity (unauthenticated) always passes (emulator dev mode)
 *   - No ACL metadata → use default permissions (rwxr-x---)
 *   - The user::, group:: and other:: entries of the ACL take precedence over
 *     the permission string for the owner, owning group and other classes
 */
export function checkAcl(
  identity: IDfsAuthenticatedIdentity | undefined,
  owner: string | undefined,
  group: string | undefined,
  permissionsStr: string | undefined,
  aclStr: string | undefined,
  requiredPermission: AclPermission
): AclCheckResult {
  // No identity at all = emulator/dev mode (request never went through
  // Bearer token auth) → bypass.
  if (!identity) {
    return { allowed: true, reason: "No authenticated identity — emulator mode bypass" };
  }

  // An identity object is present, meaning a Bearer token WAS supplied and
  // accepted (BlobTokenAuthenticator.authenticateBasic does not validate the
  // token signature), but it carries neither an `oid` nor a `upn` claim.
  // Treating this as "emulator mode" would let a caller trivially disable
  // ACL enforcement by presenting a token stripped of these claims. Fail
  // closed instead: we cannot evaluate ACLs without an identifiable caller.
  if (!identity.oid && !identity.upn) {
    return { allowed: false, reason: "Authenticated identity missing oid/upn claims — cannot evaluate ACL" };
  }

  const callerId = identity.oid || identity.upn || "";
  const effectiveOwner = owner || "$superuser";

  // $superuser caller bypasses all ACL checks
  if (callerId === "$superuser") {
    return { allowed: true, reason: "$superuser caller bypasses ACL checks" };
  }

  const aclEntries = parseAcl(aclStr);

  // Check if caller is the owner
  if (callerId === effectiveOwner) {
    const ownerPerms = resolveBaseEntry("user", permissionsStr, aclEntries);
    if (entryHasPermission(ownerPerms, requiredPermission)) {
      return { allowed: true, reason: "Owner permission granted" };
    }
    return { allowed: false, reason: "Owner does not have required permission" };
  }

  // Find mask entry (used to limit named user and group permissions)
  const maskEntry = aclEntries.find(e => e.type === "mask" && e.entityId === "");

  // Check named user entries
  const namedUser = aclEntries.find(
    e => e.type === "user" && e.entityId !== "" && e.entityId === callerId
  );
  if (namedUser) {
    const effective = maskEntry
      ? entryHasPermission(namedUser, requiredPermission) && entryHasPermission(maskEntry, requiredPermission)
      : entryHasPermission(namedUser, requiredPermission);
    if (effective) {
      return { allowed: true, reason: `Named user ACL entry matched (${callerId})` };
    }
    return { allowed: false, reason: `Named user ACL entry matched but lacks permission` };
  }

  // Named group ACL entries (group:<id>:rwx) are intentionally skipped here.
  // Resolving AAD group membership would require a live token/graph call, which is
  // out of scope for an emulator. Callers relying on named group ACLs will fall
  // through to "other" permissions, which is a known and documented limitation.
  const namedGroupEntries = aclEntries.filter(e => e.type === "group" && e.entityId !== "");
  if (namedGroupEntries.length > 0) {
    logger.warn(
      `DfsAclEnforcer: path has ${namedGroupEntries.length} named-group ACL entr${namedGroupEntries.length === 1 ? "y" : "ies"} ` +
      `(${namedGroupEntries.map(e => e.entityId).join(", ")}) that cannot be evaluated (no AAD group membership resolution ` +
      `in the emulator) — caller will be evaluated against the owning group / other permissions only.`
    );
  }

  // Check the owning group (only if the caller's OID/UPN matches the group identifier)
  const effectiveGroup = group || "$superuser";
  if (callerId === effectiveGroup) {
    const groupPerms = resolveBaseEntry("group", permissionsStr, aclEntries);
    const effective = maskEntry
      ? entryHasPermission(groupPerms, requiredPermission) && entryHasPermission(maskEntry, requiredPermission)
      : entryHasPermission(groupPerms, requiredPermission);
    if (effective) {
      return { allowed: true, reason: "Group permission granted" };
    }
    return { allowed: false, reason: "Group does not have required permission" };
  }

  // Fall through to "other" permissions
  const otherPerms = resolveBaseEntry("other", permissionsStr, aclEntries);
  if (entryHasPermission(otherPerms, requiredPermission)) {
    return { allowed: true, reason: "Other permission granted" };
  }

  return { allowed: false, reason: "Insufficient ACL permissions" };
}
