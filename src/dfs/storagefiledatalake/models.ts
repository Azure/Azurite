// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

export declare interface PathAccessControlItem {
  /**
   * Indicates whether this is the default entry for the ACL.
   */
  defaultScope: boolean;
  /**
   * Specifies which role this entry targets.
   */
  accessControlType: AccessControlType;
  /**
   * Specifies the entity for which this entry applies.
   */
  entityId: string;
  /**
   * Access control permissions.
   */
  permissions: RolePermissions;
}

export declare type AccessControlType = "user" | "group" | "mask" | "other";

export declare interface RolePermissions {
  read: boolean;
  write: boolean;
  execute: boolean;
}

export declare interface PathPermissions {
  owner: RolePermissions;
  group: RolePermissions;
  other: RolePermissions;
  stickyBit: boolean;
  extendedAcls: boolean;
}

export declare interface RemovePathAccessControlItem {
  /**
   * Indicates whether this is the default entry for the ACL.
   */
  defaultScope: boolean;
  /**
   * Specifies which role this entry targets.
   */
  accessControlType: AccessControlType;
  /**
   * Specifies the entity for which this entry applies.
   * Must be omitted for types mask or other. It must also be omitted when the user or group is the owner.
   */
  entityId?: string;
}
