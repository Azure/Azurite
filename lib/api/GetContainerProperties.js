'use strict';

const storageManager = require('./../StorageManager'),
    ResponseHeader = require('./../model/ResponseHeader');

class GetContainerProperties {
    constructor() {
    }

    process(req, res, containerName) {
        return storageManager.getContainerProperties(containerName, { leaseId: req.headers['x-ms-lease-id'] })
            .then((result) => {
                const leaseProps = {};
                leaseProps['x-ms-lease-status'] = (['available', 'broken', 'expired'].includes(result.container.leaseState)) ? 'unlocked' : 'locked';
                leaseProps['x-ms-lease-state'] = result.container.leaseState;
                if (leaseProps['x-ms-lease-state'] === 'leased') {
                    leaseProps['x-ms-lease-duration'] = (result.container.leaseDuration === -1) ? 'infinite' : 'fixed';
                } 
                res.set(new ResponseHeader(result.httpProps,
                    result.metaProps,
                    leaseProps));
                res.status(200).send();
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }
}

module.exports = new GetContainerProperties();