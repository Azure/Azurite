

const AError = require("./../../core/AzuriteError"),
    ErrorCodes = require("./../../core/ErrorCodes");

/*
 * When a queue with the specified name already exists, the Queue service checks the metadata 
 * associated with the existing queue. If the existing metadata does not match the metadata 
 * provided with the Create Queue request, the operation fails and status code 409 (Conflict) is returned. 
 * See https://docs.microsoft.com/rest/api/storageservices/create-queue4 for details.
 */
class QueueCreation {
    constructor() {
    }

    validate({ request = undefined, queue = undefined }) {
        if (queue === undefined) {
            return;
        }

        Object.keys(queue.metaProps).forEach((prop) => {
            if (queue.metaProps[prop] !== request.metaProps[prop]) {
                throw new AError(ErrorCodes.QueueAlreadyExists);
            }
        });
    }
}

export default new QueueCreation;