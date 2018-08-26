'use strict';

/**
 * Keeps track of the latest snapshot time for each blob in every container.
 * This is needed since time resolution in most SDKs work on a second level. In particular, 
 * during unit-tests chances are high that subsequent snapshots of a blob collide time-wise since
 * they only differ at the milliseconds level which is unlikely in a prod setting when communicating with 
 * Azure Blob Storage over network.
 * 
 * SnapshotTimeManager provides means to avoid such conflicts by returning a timestamp that is at least
 * one second greater than the last snapshot time of a particular blob.
 * 
 * @class SnapshotTimeManager
 */
class SnapshotTimeManager {
    constructor() {
        this.times = {};
    }

    /**
     * Updates / Adds the date of the latest snapshot of a particular blob.
     * 
     * @param {String} id of the blob 
     * @param {Date} date
     * 
     * @memberof SnapshotTimeManager
     */
    _update(id, date) {
        this.times[id] = date;
    }

    /**
     * Returns a timestamp (UTC String) that is at least one second greater than the
     * last snapshot time of a particular blob.
     * 
     * @param {String} id of the blob 
     * @param {Date} now reference time for the snapshot to be taken
     * 
     * @memberof SnapshotTimeManager
     */
    getDate(id, now) {
        const date = this.times[id];
        if (date === undefined || (now.getTime() - date.getTime()) > 1000) {
            this._update(id, now);
            return now;
        }
        const updatedDate = new Date(date);
        updatedDate.setSeconds(date.getSeconds() + 1);
        this._update(id, updatedDate);
        return updatedDate;
    }
}

export default new SnapshotTimeManager();