export enum AccountSASResourceType {
  Service = "s",
  Container = "c",
  Object = "o",
  Any = "AnyResourceType" // This is only used for blob batch operation.
}

/**
 * This is a helper class to construct a string representing the resources accessible by an AccountSAS. Setting a value
 * to true means that any SAS which uses these permissions will grant access to that resource type. Once all the
 * values are set, this should be serialized with toString and set as the resources field on an
 * {@link AccountSASSignatureValues} object. It is possible to construct the resources string without this class, but
 * the order of the resources is particular and this class guarantees correctness.
 *
 * @export
 * @class AccountSASResourceTypes
 */
export default class AccountSASResourceTypes {
  /**
   * Creates an {@link AccountSASResourceType} from the specified resource types string. This method will throw an
   * Error if it encounters a character that does not correspond to a valid resource type.
   *
   * @static
   * @param {string} resourceTypes
   * @returns {AccountSASResourceTypes}
   * @memberof AccountSASResourceTypes
   */
  public static parse(resourceTypes: string): AccountSASResourceTypes {
    const accountSASResourceTypes = new AccountSASResourceTypes();

    for (const c of resourceTypes) {
      switch (c) {
        case AccountSASResourceType.Service:
          if (accountSASResourceTypes.service) {
            throw new RangeError(`Duplicated permission character: ${c}`);
          }
          accountSASResourceTypes.service = true;
          break;
        case AccountSASResourceType.Container:
          if (accountSASResourceTypes.container) {
            throw new RangeError(`Duplicated permission character: ${c}`);
          }
          accountSASResourceTypes.container = true;
          break;
        case AccountSASResourceType.Object:
          if (accountSASResourceTypes.object) {
            throw new RangeError(`Duplicated permission character: ${c}`);
          }
          accountSASResourceTypes.object = true;
          break;
        default:
          throw new RangeError(`Invalid resource type: ${c}`);
      }
    }

    return accountSASResourceTypes;
  }

  /**
   * Permission to access service level APIs granted.
   *
   * @type {boolean}
   * @memberof AccountSASResourceTypes
   */
  public service: boolean = false;

  /**
   * Permission to access container level APIs (Blob Containers, Tables, Queues, File Shares) granted.
   *
   * @type {boolean}
   * @memberof AccountSASResourceTypes
   */
  public container: boolean = false;

  /**
   * Permission to access object level APIs (Blobs, Table Entities, Queue Messages, Files) granted.
   *
   * @type {boolean}
   * @memberof AccountSASResourceTypes
   */
  public object: boolean = false;

  /**
   * Converts the given resource types to a string.
   *
   * @see https://docs.microsoft.com/en-us/rest/api/storageservices/constructing-an-account-sas
   *
   * @returns {string}
   * @memberof AccountSASResourceTypes
   */
  public toString(): string {
    const resourceTypes: string[] = [];
    if (this.service) {
      resourceTypes.push(AccountSASResourceType.Service);
    }
    if (this.container) {
      resourceTypes.push(AccountSASResourceType.Container);
    }
    if (this.object) {
      resourceTypes.push(AccountSASResourceType.Object);
    }
    return resourceTypes.join("");
  }
}
