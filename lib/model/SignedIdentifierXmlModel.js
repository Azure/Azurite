'use strict';

class SignedIdentifiers {
    constructor() {
        this.SignedIdentifier = [];
    }

    addSignedIdentifier(id, start, expiry, permission) {
        this.SignedIdentifier.push({
            Id: id,
            AccessPolicy: {
                Start: start,
                Expiry: expiry,
                Permission: permission 
            }
        });
    }
}

module.exports = SignedIdentifiers;