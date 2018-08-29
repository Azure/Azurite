'use strict';

import storageManager from './../../core/blob/StorageManager';
import { LeaseStatus } from './../../core/Constants';
import N from './../../core/HttpHeaderNames';

class GetContainerProperties {
    constructor() {
    }

    process(request, res) {
        storageManager.getContainerProperties(request)
            .then((response) => {
                response.addHttpProperty(N.LEASE_STATUS, ([LeaseStatus.AVAILABLE, LeaseStatus.BROKEN, LeaseStatus.EXPIRED].includes(response.proxy.original.leaseState)) ? 'unlocked' : 'locked');
                response.addHttpProperty(N.LEASE_STATE, response.proxy.original.leaseState);
                if (response.httpProps[N.LEASE_STATE] === LeaseStatus.LEASED) {
                    response.addHttpProperty(N.LEASE_DURATION, (response.proxy.original.leaseDuration === -1) ? 'infinite' : 'fixed');
                }
                if (response.proxy.original.access !== 'private') {
                    response.addHttpProperty(N.BLOB_PUBLIC_ACCESS, response.proxy.original.access);
                }
                res.set(response.httpProps);
                res.status(200).send();
            });
    }
}

export default new GetContainerProperties();