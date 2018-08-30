/** @format */

import { AzuriteError }from './../../core/AzuriteError';
import N from './../../core/HttpHeaderNames';
import { LeaseActions as LeaseAction } from './../../core/Constants';
import { ErrorCodes } from '../../core/AzuriteError';

/**
 * Checks whether lease duration and lease break period conforms to specification
 * at https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container:
 * leaseDuration: -1;[15-60]
 * leaseBreakPeriod: [0-60]
 *
 * @class LeaseDuration
 */
class LeaseDuration {
  constructor() {}

        // x-ms-lease-duration is only required and processed for lease action 'acquire' 
        if (leaseAction === LeaseAction.ACQUIRE) {
            if (!(leaseDuration === -1 || leaseDuration >= 15 && leaseDuration <= 60)) {
                throw ErrorCodes.InvalidHeaderValue;
            }
        }

        // x-ms-lease-break-period is optional
        if (leaseBreakPeriod) {
            if (!(leaseBreakPeriod >= 0 && leaseBreakPeriod <= 60)) {
                throw ErrorCodes.InvalidHeaderValue;
            }
        }

    // x-ms-lease-break-period is optional
    if (leaseBreakPeriod) {
      if (!(leaseBreakPeriod >= 0 && leaseBreakPeriod <= 60)) {
        throw new AError(ErrorCodes.InvalidHeaderValue);
      }
    }
  }
}

export default new LeaseDuration();