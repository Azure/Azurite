

const AError = require("./../../core/AzuriteError"),
    ErrorCodes = require("./../../core/ErrorCodes"),
    EntityType = require("./../../core/Constants").StorageEntityType;

class SupportedBlobType {
    constructor() {
    }

    validate({ request = undefined }) {
        if (request.entityType !== EntityType.AppendBlob &&
            request.entityType !== EntityType.BlockBlob &&
            request.entityType !== EntityType.PageBlob) {
            throw new AError(ErrorCodes.UnsupportedBlobType);
        }
    }
}

export default new SupportedBlobType();