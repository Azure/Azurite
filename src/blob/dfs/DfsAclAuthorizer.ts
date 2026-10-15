import IBlobMetadataStore from "../persistence/IBlobMetadataStore";
import { checkAcl, AclCheckResult, AclPermission } from "./DfsAclEnforcer";
import { IDfsAuthenticatedIdentity } from "./DfsContext";
import { createStorageContext } from "./DfsContextFactory";

/**
 * The access an operation needs to a path.
 * - read: read the path (r on it)
 * - write: write the path (w on it, or w and x on its directory to create it)
 * - delete: remove the path from its directory (w and x on the directory)
 */
export type PathAccess = "read" | "write" | "delete";

type Metadata = { [key: string]: string } | undefined;

/**
 * Evaluates the POSIX ACLs of DFS (ADLS Gen2) paths for a Bearer identity in
 * --oauth acl mode, like PathHandler does for the DFS endpoint. Used to apply
 * the same ACLs to the Blob API on hierarchical namespace containers.
 *
 * Execute (traversal) permission is required on every existing ancestor
 * directory except the filesystem root, whose ACL the emulator can't set. A
 * missing path only needs traversal, so that the operation reports it missing.
 */
export default class DfsAclAuthorizer {
  public constructor(private readonly metadataStore: IBlobMetadataStore) {}

  public async authorize(
    identity: IDfsAuthenticatedIdentity,
    account: string,
    filesystem: string,
    path: string,
    access: PathAccess,
    requestId?: string
  ): Promise<AclCheckResult> {
    const ancestors: string[] = [];
    for (let dir = parentPath(path); dir !== ""; dir = parentPath(dir)) {
      ancestors.push(dir);
    }

    const metadataOf = async (name: string): Promise<{ exists: boolean; metadata: Metadata }> => {
      try {
        const props = await this.metadataStore.getBlobProperties(
          createStorageContext(requestId), account, filesystem, name, undefined, undefined
        );
        return { exists: true, metadata: props.metadata };
      } catch (error: any) {
        if (error?.statusCode === 404) {
          return { exists: false, metadata: undefined };
        }
        throw error;
      }
    };
    const evaluate = (metadata: Metadata, permissions: AclPermission[]): AclCheckResult => {
      for (const permission of permissions) {
        const result = checkAcl(
          identity,
          metadata?.dfsAclOwner,
          metadata?.dfsAclGroup,
          metadata?.dfsAclPermissions,
          metadata?.dfsAcl,
          permission
        );
        if (!result.allowed) {
          return result;
        }
      }
      return { allowed: true, reason: "Permission granted" };
    };

    // The nearest existing directory containing the path (the root if none)
    let directoryIndex = ancestors.length;
    let directory: Metadata = undefined;
    for (let i = 0; i < ancestors.length; i++) {
      const found = await metadataOf(ancestors[i]);
      if (found.exists) {
        directoryIndex = i;
        directory = found.metadata;
        break;
      }
    }
    for (const ancestor of ancestors.slice(directoryIndex + 1)) {
      const found = await metadataOf(ancestor);
      if (found.exists) {
        const result = evaluate(found.metadata, ["x"]);
        if (!result.allowed) {
          return result;
        }
      }
    }

    const target = await metadataOf(path);
    const atRoot = directoryIndex === ancestors.length;

    if (access === "read" || (access === "write" && target.exists)) {
      // Reaching the path requires execute on its directory (not the root)
      if (!atRoot) {
        const result = evaluate(directory, ["x"]);
        if (!result.allowed) {
          return result;
        }
      }
      if (!target.exists) {
        return { allowed: true, reason: "Missing path" };
      }
      return evaluate(target.metadata, [access === "read" ? "r" : "w"]);
    }

    // Creating or removing an entry requires write and execute on its
    // directory, and the sticky bit restricts removing to the owners
    const result = evaluate(atRoot ? undefined : directory, ["w", "x"]);
    if (!result.allowed || access !== "delete" || !target.exists || atRoot) {
      return result;
    }
    const permissions = directory?.dfsAclPermissions || "";
    if (permissions.charAt(8) === "t" || permissions.charAt(8) === "T") {
      const callerId = identity.oid || identity.upn || "";
      if (
        callerId !== "$superuser" &&
        callerId !== (directory?.dfsAclOwner || "$superuser") &&
        callerId !== (target.metadata?.dfsAclOwner || "$superuser")
      ) {
        return { allowed: false, reason: "Sticky bit: caller owns neither the path nor its directory" };
      }
    }
    return result;
  }
}

function parentPath(path: string): string {
  return path.includes("/") ? path.substring(0, path.lastIndexOf("/")) : "";
}
