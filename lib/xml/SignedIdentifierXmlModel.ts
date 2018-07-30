class SignedIdentifiers {
  public SignedIdentifier: any[];
  constructor() {
    this.SignedIdentifier = [];
  }

  public addSignedIdentifier(id, start, expiry, permissionlist) {
    this.SignedIdentifier.push({
      AccessPolicy: {
        Expiry: expiry,
        Permission: permissionlist,
        Start: start
      },
      Id: id
    });
  }
}

export default SignedIdentifiers;
