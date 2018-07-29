

const AError = require("./../../core/AzuriteError"),
    N = require("./../../core/HttpHeaderNames"),
    ErrorCodes = require("./../../core/ErrorCodes");

class EntityIfMatch {
    constructor() {
    }

    validate({ request = undefined, entity = undefined }) {
        if (request.httpProps[N.IF_MATCH] === undefined) {
            throw new AError(ErrorCodes.MissingRequiredHeader);
        }
        if (request.httpProps[N.IF_MATCH] === "*") {
            return;
        }
        if (request.httpProps[N.IF_MATCH] !== entity._.etag) {
            throw new AError(ErrorCodes.UpdateConditionNotSatisfied);
        }
    }
}

export default new EntityIfMatch;