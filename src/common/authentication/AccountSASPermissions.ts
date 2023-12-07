export enum AccountSASPermission {
  Read = "r",
  Write = "w",
  Delete = "d",
  DeleteVersion = "x",
  List = "l",
  Add = "a",
  Create = "c",
  Update = "u",
  Process = "p",
  Tag = "t",
  Filter = "f",
  SetImmutabilityPolicy = "i",
  PermanentDelete = "y",
  Any = "AnyPermission"  // This is only used for blob batch operation.
}

/**
 * This is a helper class to construct a string representing the permissions granted by an AccountSAS. Setting a value
 * to true means that any SAS which uses these permissions will grant permissions for that operation. Once all the
 * values are set, this should be serialized with toString and set as the permissions field on an
 * {@link AccountSASSignatureValues} object. It is possible to construct the permissions string without this class, but
 * the order of the permissions is particular and this class guarantees correctness.
 *
 * @export
 * @class AccountSASPermissions
 */
export default class AccountSASPermissions {
  /**
   * Parse initializes the AccountSASPermissions fields from a string.
   *
   * @static
   * @param {string} permissions
   * @returns {AccountSASPermissions}
   * @memberof AccountSASPermissions
   */
  public static parse(permissions: string): AccountSASPermissions {
    const accountSASPermissions = new AccountSASPermissions();

    for (const c of permissions) {
      switch (c) {
        case AccountSASPermission.Read:
          if (accountSASPermissions.read) {
            throw new RangeError(`Duplicated permission character: ${c}`);
          }
          accountSASPermissions.read = true;
          break;
        case AccountSASPermission.Write:
          if (accountSASPermissions.write) {
            throw new RangeError(`Duplicated permission character: ${c}`);
          }
          accountSASPermissions.write = true;
          break;
        case AccountSASPermission.Delete:
          if (accountSASPermissions.delete) {
            throw new RangeError(`Duplicated permission character: ${c}`);
          }
          accountSASPermissions.delete = true;
          break;
        case AccountSASPermission.DeleteVersion:
          if (accountSASPermissions.deleteVersion) {
            throw new RangeError(`Duplicated permission character: ${c}`);
          }
          accountSASPermissions.deleteVersion = true;
          break;
        case AccountSASPermission.List:
          if (accountSASPermissions.list) {
            throw new RangeError(`Duplicated permission character: ${c}`);
          }
          accountSASPermissions.list = true;
          break;
        case AccountSASPermission.Add:
          if (accountSASPermissions.add) {
            throw new RangeError(`Duplicated permission character: ${c}`);
          }
          accountSASPermissions.add = true;
          break;
        case AccountSASPermission.Create:
          if (accountSASPermissions.create) {
            throw new RangeError(`Duplicated permission character: ${c}`);
          }
          accountSASPermissions.create = true;
          break;
        case AccountSASPermission.Update:
          if (accountSASPermissions.update) {
            throw new RangeError(`Duplicated permission character: ${c}`);
          }
          accountSASPermissions.update = true;
          break;
        case AccountSASPermission.Process:
          if (accountSASPermissions.process) {
            throw new RangeError(`Duplicated permission character: ${c}`);
          }
          accountSASPermissions.process = true;
          break;
        case AccountSASPermission.Tag:
          if (accountSASPermissions.tag) {
            throw new RangeError(`Duplicated permission character: ${c}`);
          }
          accountSASPermissions.tag = true;
          break;
        case AccountSASPermission.Filter:
          if (accountSASPermissions.filter) {
            throw new RangeError(`Duplicated permission character: ${c}`);
          }
          accountSASPermissions.filter = true;
          break;
        case AccountSASPermission.SetImmutabilityPolicy:
          if (accountSASPermissions.setImmutabilityPolicy) {
            throw new RangeError(`Duplicated permission character: ${c}`);
          }
          accountSASPermissions.setImmutabilityPolicy = true;
          break;
        case AccountSASPermission.PermanentDelete:
          if (accountSASPermissions.permanentDelete) {
            throw new RangeError(`Duplicated permission character: ${c}`);
          }
          accountSASPermissions.permanentDelete = true;
          break;
        default:
          throw new RangeError(`Invalid permission character: ${c}`);
      }
    }

    return accountSASPermissions;
  }

  /**
   * Permission to read resources and list queues and tables granted.
   *
   * @type {boolean}
   * @memberof AccountSASPermissions
   */
  public read: boolean = false;

  /**
   * Permission to write resources granted.
   *
   * @type {boolean}
   * @memberof AccountSASPermissions
   */
  public write: boolean = false;

  /**
   * Permission to create blobs and files granted.
   *
   * @type {boolean}
   * @memberof AccountSASPermissions
   */
  public delete: boolean = false;

  /**
   * Permission to delete blob version.
   *
   * @type {boolean}
   * @memberof AccountSASPermissions
   */
  public deleteVersion: boolean = false;

  /**
   * Permission to list blob containers, blobs, shares, directories, and files granted.
   *
   * @type {boolean}
   * @memberof AccountSASPermissions
   */
  public list: boolean = false;

  /**
   * Permission to add messages, table entities, and append to blobs granted.
   *
   * @type {boolean}
   * @memberof AccountSASPermissions
   */
  public add: boolean = false;

  /**
   * Permission to create blobs and files granted.
   *
   * @type {boolean}
   * @memberof AccountSASPermissions
   */
  public create: boolean = false;

  /**
   * Permissions to update messages and table entities granted.
   *
   * @type {boolean}
   * @memberof AccountSASPermissions
   */
  public update: boolean = false;

  /**
   * Permission to get and delete messages granted.
   *
   * @type {boolean}
   * @memberof AccountSASPermissions
   */
  public process: boolean = false;

  /**
   * Permission to handle blob tag.
   *
   * @type {boolean}
   * @memberof AccountSASPermissions
   */
  public tag: boolean = false;

  /**
   * Permission to filter blob by tag.
   *
   * @type {boolean}
   * @memberof AccountSASPermissions
   */
  public filter: boolean = false;

  /**
   * Permission to set ImmutabilityPolicy on blob.
   *
   * @type {boolean}
   * @memberof AccountSASPermissions
   */
  public setImmutabilityPolicy: boolean = false;

  /**
   * Permission to permanent delete a blob.
   *
   * @type {boolean}
   * @memberof AccountSASPermissions
   */
  public permanentDelete: boolean = false;

  /**
   * Produces the SAS permissions string for an Azure Storage account.
   * Call this method to set AccountSASSignatureValues Permissions field.
   *
   * Using this method will guarantee the resource types are in
   * an order accepted by the service.
   *
   * @see https://docs.microsoft.com/en-us/rest/api/storageservices/constructing-an-account-sas
   *
   * @returns {string}
   * @memberof AccountSASPermissions
   */
  public toString(): string {
    // The order of the characters should be as specified here to ensure correctness:
    // https://docs.microsoft.com/en-us/rest/api/storageservices/constructing-an-account-sas
    // Use a string array instead of string concatenating += operator for performance
    const permissions: string[] = [];
    if (this.read) {
      permissions.push(AccountSASPermission.Read);
    }
    if (this.write) {
      permissions.push(AccountSASPermission.Write);
    }
    if (this.delete) {
      permissions.push(AccountSASPermission.Delete);
    }
    if (this.deleteVersion) {
      permissions.push(AccountSASPermission.DeleteVersion);
    }
    if (this.list) {
      permissions.push(AccountSASPermission.List);
    }
    if (this.add) {
      permissions.push(AccountSASPermission.Add);
    }
    if (this.create) {
      permissions.push(AccountSASPermission.Create);
    }
    if (this.update) {
      permissions.push(AccountSASPermission.Update);
    }
    if (this.process) {
      permissions.push(AccountSASPermission.Process);
    }
    if (this.tag) {
      permissions.push(AccountSASPermission.Tag);
    }
    if (this.filter) {
      permissions.push(AccountSASPermission.Filter);
    }
    if (this.setImmutabilityPolicy) {
      permissions.push(AccountSASPermission.SetImmutabilityPolicy);
    }
    if (this.permanentDelete) {
      permissions.push(AccountSASPermission.PermanentDelete);
    }
    return permissions.join("");
  }
}
