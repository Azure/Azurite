/** @format */

import env from './../../core/env';
import AzuriteQueueRequest from '../../model/queue/AzuriteQueueRequest';
import { Operations } from './../../core/Constants';

/*
 * Route definitions for all operation on the 'account' resource type.
 * See https://docs.microsoft.com/en-us/rest/api/storageservices/operations-on-the-account--queue-service-
 * for details on specification.
 */
export default (app) => {
    app.route(`/${env.emulatedStorageAccountName}`)
        .get((req, res, next) => {
            if (req.query.comp === 'list') {
                req.azuriteOperation = Operations.Queue.LIST_QUEUES;
            } 
            req.azuriteRequest = new AzuriteQueueRequest({ req: req });
            next();
        });
};