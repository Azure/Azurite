

const AError = require("./../../core/AzuriteError"),
    N = require("./../../core/HttpHeaderNames"),
    LeaseAction = require("./../../core/Constants").LeaseActions,
    ErrorCodes = require("./../../core/ErrorCodes");

/**
 * Checks whether lease duration and lease break period conforms to specification
 * at https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container:
 * leaseDuration: -1;[15-60]
 * leaseBreakPeriod: [0-60] 
 * 
 * @class LeaseDuration
 */
class LeaseDuration {
    constructor() {
    }

    validate({ request = undefined }) {
        const leaseAction = request.httpProps[N.LEASE_ACTION],
            leaseBreakPeriod = (request.httpProps[N.LEASE_BREAK_PERIOD]) ? parseInt(request.httpProps[N.LEASE_BREAK_PERIOD]) : undefined,
            leaseDuration = (request.httpProps[N.LEASE_DURATION]) ? parseInt(request.httpProps[N.LEASE_DURATION]) : undefined;

        // x-ms-lease-duration is only required and processed for lease action "acquire" 
        if (leaseAction === LeaseAction.ACQUIRE) {
            if (!(leaseDuration === -1 || leaseDuration >= 15 && leaseDuration <= 60)) {
                throw new AError(ErrorCodes.InvalidHeaderValue);
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