// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  PathAccessControlItem,
  PathPermissions,
  RemovePathAccessControlItem,
  RolePermissions
} from "./models";

export function toRolePermissions(
  permissionsString: string
): RolePermissions | undefined {
  if (permissionsString.length !== 3) {
    return undefined;
  }

  permissionsString = permissionsString.toLowerCase();

  let read = false;
  if (permissionsString[0] === "r") {
    read = true;
  } else if (permissionsString[0] !== "-") {
    return undefined;
  }

  let write = false;
  if (permissionsString[1] === "w") {
    write = true;
  } else if (permissionsString[1] !== "-") {
    return undefined;
  }

  let execute = false;
  if (permissionsString[2] === "x") {
    execute = true;
  } else if (permissionsString[2] !== "-") {
    return undefined;
  }

  return { read, write, execute };
}

const permissionsMap: Map<string, string> = new Map<string, string>();
permissionsMap.set("0", "---");
permissionsMap.set("1", "--x");
permissionsMap.set("2", "-w-");
permissionsMap.set("3", "-wx");
permissionsMap.set("4", "r--");
permissionsMap.set("5", "r-x");
permissionsMap.set("6", "rw-");
permissionsMap.set("7", "rwx");

function normalizePermissionsString(
  permissionsString: string,
  umask?: string
): string | undefined {
  let permissionsNumber = parseInt(permissionsString, 8);
  if (!isNaN(permissionsNumber) && permissionsString.length === 4) {
    const umaskNumber = parseInt(umask || "not a number", 8);
    if (umask !== undefined && umask.length == 4 && !isNaN(umaskNumber)) {
      permissionsNumber = permissionsNumber & ~umaskNumber;
      permissionsString = permissionsNumber.toString(8).padStart(4, "0");
    }
    permissionsString =
      permissionsMap.get(permissionsString[1])! +
      permissionsMap.get(permissionsString[2]) +
      permissionsMap.get(permissionsString[3]);
  }

  if (permissionsString.length !== 9 && permissionsString.length !== 10) {
    return undefined;
  }

  if (permissionsString[8] === "t") {
    const firstPart = permissionsString.substr(0, 8);
    const lastPart = permissionsString.substr(9);
    permissionsString = firstPart + "x" + lastPart;
  } else if (permissionsString[8] === "T") {
    const firstPart = permissionsString.substr(0, 8);
    const lastPart = permissionsString.substr(9);
    permissionsString = firstPart + "-" + lastPart;
  }

  // Case insensitive
  return permissionsString.toLowerCase();
}

export function toPermissions(
  permissionsString: string,
  umask?: string
): PathPermissions | undefined {
  const permissionsStr = normalizePermissionsString(permissionsString, umask);
  if (permissionsStr === undefined) return undefined;
  permissionsString = permissionsStr;
  let extendedAcls = false;
  if (permissionsString.length === 10) {
    if (permissionsString[9] === "+") {
      extendedAcls = true;
    } else {
      return undefined;
    }
  }

  const owner = toRolePermissions(permissionsString.substr(0, 3));
  const group = toRolePermissions(permissionsString.substr(3, 3));
  const other = toRolePermissions(permissionsString.substr(6, 3));

  if (owner === undefined || group === undefined || other === undefined) {
    return undefined;
  }

  return {
    owner,
    group,
    other,
    stickyBit: permissionsString[8] === "t" || permissionsString[8] === "T",
    extendedAcls
  };
}

export function toAccessControlItem(
  aclItemString: string
): PathAccessControlItem | undefined {
  if (aclItemString === "") return undefined;

  aclItemString = aclItemString.toLowerCase();

  const parts = aclItemString.split(":");
  if (parts.length < 3 || parts.length > 4) {
    return undefined;
  }

  let defaultScope = false;
  let index = 0;
  if (parts.length === 4) {
    if (parts[index] !== "default") return undefined;
    defaultScope = true;
    index++;
  }

  const accessControlType = parts[index++];
  if (
    accessControlType !== "user" &&
    accessControlType !== "group" &&
    accessControlType !== "mask" &&
    accessControlType !== "other"
  ) {
    return undefined;
  }

  const entityId = parts[index++];
  const permissions = toRolePermissions(parts[index++]);

  if (permissions === undefined) return undefined;

  return {
    defaultScope,
    accessControlType,
    entityId,
    permissions
  };
}

export function toRemoveAccessControlItem(
  aclItemString: string
): RemovePathAccessControlItem | undefined {
  if (aclItemString === "") {
    return undefined;
  }

  aclItemString = aclItemString.toLowerCase();

  const parts = aclItemString.split(":");
  if (parts.length < 1 || parts.length > 3) {
    return undefined;
  }

  if (parts.length === 3) {
    if (parts[0] !== "default") {
      return undefined;
    }
  }

  let defaultScope = false;
  let index = 0;
  if (parts[index] === "default") {
    defaultScope = true;
    index++;
  }

  const accessControlType = parts[index++];
  if (
    accessControlType !== "user" &&
    accessControlType !== "group" &&
    accessControlType !== "mask" &&
    accessControlType !== "other"
  ) {
    return undefined;
  }

  const entityId = parts[index++];

  return {
    defaultScope,
    accessControlType,
    entityId
  };
}

export function toAcl(aclString?: string): PathAccessControlItem[] | undefined {
  if (aclString === undefined || aclString === "" || aclString === null) {
    return [];
  }

  const acls = [];
  const aclParts = aclString.split(",");
  for (const aclPart of aclParts) {
    const acl = toAccessControlItem(aclPart);
    if (acl === undefined) return undefined;
    acls.push(acl);
  }

  return acls;
}

export function toRemoveAcl(
  aclString?: string
): RemovePathAccessControlItem[] | undefined {
  if (aclString === undefined || aclString === "" || aclString === null) {
    return [];
  }

  const acls = [];
  const aclParts = aclString.split(",");
  for (const aclPart of aclParts) {
    const acl = toRemoveAccessControlItem(aclPart);
    if (acl === undefined) return undefined;
    acls.push(acl);
  }

  return acls;
}

export function toAccessControlItemString(item: PathAccessControlItem): string {
  const entityIdString = item.entityId !== undefined ? `:${item.entityId}` : "";
  const permissionsString =
    item.permissions !== undefined
      ? `:${toRolePermissionsString(item.permissions)}`
      : "";
  return `${item.defaultScope ? "default:" : ""}${
    item.accessControlType
  }${entityIdString}${permissionsString}`;
}

export function toAclString(acl: PathAccessControlItem[]): string {
  return acl.map(toAccessControlItemString).join(",");
}

export function toRolePermissionsString(
  p: RolePermissions,
  stickyBit: boolean = false
): string {
  return `${p.read ? "r" : "-"}${p.write ? "w" : "-"}${
    stickyBit ? (p.execute ? "t" : "T") : p.execute ? "x" : "-"
  }`;
}

export function toPermissionsString(permissions: PathPermissions): string {
  return `${toRolePermissionsString(
    permissions.owner
  )}${toRolePermissionsString(permissions.group)}${toRolePermissionsString(
    permissions.other,
    permissions.stickyBit
  )}${permissions.extendedAcls ? "+" : ""}`;
}

export function permissionsStringToAclString(
  permissions: string
): string | undefined {
  const normalizedPermissions = normalizePermissionsString(permissions, "0000");
  if (normalizedPermissions === undefined) return undefined;

  return (
    `user::${normalizedPermissions.substring(0, 3)},` +
    `group::${normalizedPermissions.substring(3, 6)},` +
    `other::${normalizedPermissions.substring(6, 9)}`
  );
}
