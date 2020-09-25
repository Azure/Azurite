export enum AccountSASService {
  Blob = "b",
  File = "f",
  Queue = "q",
  Table = "t"
}

/**
 * ONLY AVAILABLE IN NODE.JS RUNTIME.
 *
 * This is a helper class to construct a string representing the services accessible by an AccountSAS. Setting a value
 * to true means that any SAS which uses these permissions will grant access to that service. Once all the
 * values are set, this should be serialized with toString and set as the services field on an
 * {@link AccountSASSignatureValues} object. It is possible to construct the services string without this class, but
 * the order of the services is particular and this class guarantees correctness.
 *
 * @export
 * @class AccountSASServices
 */
export default class AccountSASServices {
  /**
   * Creates an {@link AccountSASServices} from the specified services string. This method will throw an
   * Error if it encounters a character that does not correspond to a valid service.
   *
   * @static
   * @param {string} services
   * @returns {AccountSASServices}
   * @memberof AccountSASServices
   */
  public static parse(services: string): AccountSASServices {
    const accountSASServices = new AccountSASServices();

    for (const c of services) {
      switch (c) {
        case AccountSASService.Blob:
          if (accountSASServices.blob) {
            throw new RangeError(`Duplicated permission character: ${c}`);
          }
          accountSASServices.blob = true;
          break;
        case AccountSASService.File:
          if (accountSASServices.file) {
            throw new RangeError(`Duplicated permission character: ${c}`);
          }
          accountSASServices.file = true;
          break;
        case AccountSASService.Queue:
          if (accountSASServices.queue) {
            throw new RangeError(`Duplicated permission character: ${c}`);
          }
          accountSASServices.queue = true;
          break;
        case AccountSASService.Table:
          if (accountSASServices.table) {
            throw new RangeError(`Duplicated permission character: ${c}`);
          }
          accountSASServices.table = true;
          break;
        default:
          throw new RangeError(`Invalid service character: ${c}`);
      }
    }

    return accountSASServices;
  }

  /**
   * Permission to access blob resources granted.
   *
   * @type {boolean}
   * @memberof AccountSASServices
   */
  public blob: boolean = false;

  /**
   * Permission to access file resources granted.
   *
   * @type {boolean}
   * @memberof AccountSASServices
   */
  public file: boolean = false;

  /**
   * Permission to access queue resources granted.
   *
   * @type {boolean}
   * @memberof AccountSASServices
   */
  public queue: boolean = false;

  /**
   * Permission to access table resources granted.
   *
   * @type {boolean}
   * @memberof AccountSASServices
   */
  public table: boolean = false;

  /**
   * Converts the given services to a string.
   *
   * @returns {string}
   * @memberof AccountSASServices
   */
  public toString(): string {
    const services: string[] = [];
    if (this.blob) {
      services.push(AccountSASService.Blob);
    }
    if (this.table) {
      services.push(AccountSASService.Table);
    }
    if (this.queue) {
      services.push(AccountSASService.Queue);
    }
    if (this.file) {
      services.push(AccountSASService.File);
    }
    return services.join("");
  }
}
