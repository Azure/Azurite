'use strict';

const chai = require('chai'),
    expect = chai.expect,
    SnapshotManager = require('./../lib/core/blob/SnapshotTimeManager');

describe('SnapshotTimeManager', () => {
    it('should return a snapshot date that is at least one second greater than previous snapshot of same container-blob', () => {
        const timeContext = new Date(),
            d1 = SnapshotManager.getDate('id1', timeContext),
            d2 = SnapshotManager.getDate('id1', timeContext),
            d1Seconds = d1.getSeconds(),
            d2Seconds = d2.getSeconds();
        if (d2Seconds === 0) d2Seconds = 60;
        expect(d2Seconds).to.be.greaterThan(d1Seconds);
    });
});