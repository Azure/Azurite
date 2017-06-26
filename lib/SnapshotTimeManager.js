'use strict';

/**
 * Keeps track of the latest snapshot time for each blob in every container.
 * This is needed since time resolution in most SDKs work on a second level. In particular, 
 * during unit-tests chances are high that subsequent snapshots of a blob collide time-wise since
 * they only differ at the milliseconds level.
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
     * @param {String} containerName 
     * @param {String} blobName 
     * @param {Date} date 
     * 
     * @memberof SnapshotTimeManager
     */
    _update(containerName, blobName, date) {
        this.times[`${containerName}-${blobName}`] = date;
    }

    /**
     * Returns a timestamp (UTC String) that is at least one second greater than the
     * last snapshot time of a particular blob.
     * 
     * @param {String} containerName 
     * @param {String} blobName 
     * 
     * @memberof SnapshotTimeManager
     */
    getDate(containerName, blobName) {
        let date = this.times[`${containerName}-${blobName}`];
        const now = new Date();
        if (date === undefined || (now.getTime() - date.getTime()) > 1000) {
            this._update(containerName, blobName, now);
            return now;
        }
        const updatedDate = new Date(date);
        updatedDate.setSeconds(date.getSeconds() + 1);
        this._update(containerName, blobName, updatedDate);
        return updatedDate;
    }
}

module.exports = new SnapshotTimeManager();