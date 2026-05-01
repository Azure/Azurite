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

import { IDfsAuthenticatedIdentity } from "./DfsContext";

/** Required permission for an operation */
export type AclPermission = "r" | "w" | "x";

/**
 * Maps DFS operations to the minimum required permission.
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
 */
export function checkAcl(
  identity: IDfsAuthenticatedIdentity | undefined,
  owner: string | undefined,
  group: string | undefined,
  permissionsStr: string | undefined,
  aclStr: string | undefined,
  requiredPermission: AclPermission
): AclCheckResult {
  // No identity = emulator/dev mode → bypass
  if (!identity || (!identity.oid && !identity.upn)) {
    return { allowed: true, reason: "No authenticated identity — emulator mode bypass" };
  }

  const callerId = identity.oid || identity.upn || "";
  const effectiveOwner = owner || "$superuser";

  // $superuser caller bypasses all ACL checks
  if (callerId === "$superuser") {
    return { allowed: true, reason: "$superuser caller bypasses ACL checks" };
  }

  // Check if caller is the owner
  if (callerId === effectiveOwner) {
    // Use owner permissions from the permissions string (chars 0-2)
    const perms = permissionsStr || "rwxr-x---";
    const ownerPerms: AclEntry = {
      type: "user",
      entityId: "",
      read: perms.charAt(0) === "r",
      write: perms.charAt(1) === "w",
      execute: perms.charAt(2) === "x"
    };
    if (entryHasPermission(ownerPerms, requiredPermission)) {
      return { allowed: true, reason: "Owner permission granted" };
    }
    return { allowed: false, reason: "Owner does not have required permission" };
  }

  // Parse ACL entries for named user/group matching
  const aclEntries = parseAcl(aclStr);

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

  // Check group (we can't resolve AD group membership per wiki constraints,
  // so we only check the owning group if the caller matches it)
  const effectiveGroup = group || "$superuser";
  if (callerId === effectiveGroup) {
    const perms = permissionsStr || "rwxr-x---";
    const groupPerms: AclEntry = {
      type: "group",
      entityId: "",
      read: perms.charAt(3) === "r",
      write: perms.charAt(4) === "w",
      execute: perms.charAt(5) === "x"
    };
    const effective = maskEntry
      ? entryHasPermission(groupPerms, requiredPermission) && entryHasPermission(maskEntry, requiredPermission)
      : entryHasPermission(groupPerms, requiredPermission);
    if (effective) {
      return { allowed: true, reason: "Group permission granted" };
    }
    return { allowed: false, reason: "Group does not have required permission" };
  }

  // Fall through to "other" permissions (chars 6-8)
  const perms = permissionsStr || "rwxr-x---";
  const otherPerms: AclEntry = {
    type: "other",
    entityId: "",
    read: perms.charAt(6) === "r",
    write: perms.charAt(7) === "w",
    execute: perms.charAt(8) === "x"
  };
  if (entryHasPermission(otherPerms, requiredPermission)) {
    return { allowed: true, reason: "Other permission granted" };
  }

  return { allowed: false, reason: "Insufficient ACL permissions" };
}
