const AError  from "./../core/AzuriteError"),
  ErrorCodes  from "./../core/ErrorCodes");

/**
 * Checks whether the number of signed identifiers is at most 5.
 * See https://docs.microsoft.com/rest/api/storageservices/fileservices/establishing-a-stored-access-policy for spec.
 */
class NumOfSignedIdentifiers {
  public validate({ request = undefined }) {
    const si = request.payload;
    if ((si !== null || si !== undefined) && si.length > 5) {
      throw new AError(ErrorCodes.InvalidInput);
    }
  }
}

export default new NumOfSignedIdentifiers();
