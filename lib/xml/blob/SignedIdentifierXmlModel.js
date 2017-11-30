'use strict';

class SignedIdentifiers {
    constructor() {
        this.SignedIdentifier = [];
    }

    addSignedIdentifier(id, start, expiry, permissionlist) {
        this.SignedIdentifier.push({
            Id: id,
            AccessPolicy: {
                Start: start,
                Expiry: expiry,
                Permission: permissionlist 
            }
        });
    }
}

module.exports = SignedIdentifiers;