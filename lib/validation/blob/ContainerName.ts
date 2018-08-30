/** @format */

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';

/*
 * Checks whether the container name adheres to the naming convention 
 * as specified at https://docs.microsoft.com/en-us/rest/api/storageservices/naming-and-referencing-containers--blobs--and-metadata
 */
class ContainerName {
  constructor() {}

    validate({ request = undefined }) {
        const name = request.containerName;
        if (name === '$root') {
            return;
        }
        if (name.length < 3 || name.length > 63) {
            throw ErrorCodes.OutOfRangeInput;
        }
        if (/^([a-z0-9]+)(-[a-z0-9]+)*$/i.test(name) === false) { 
            throw ErrorCodes.InvalidInput;
        }
    }
  }
}

export default new ContainerName;