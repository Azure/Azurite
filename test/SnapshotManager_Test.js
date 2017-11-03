'use strict';

const chai = require('chai'),
    expect = chai.expect,
    SnapshotManager = require('./../lib/core/blob/SnapshotTimeManager');

describe('SnapshotTimeManager', () => {
    it('should return a snapshot date that is at least one second greater than previous snapshot of same container-blob', () => {
        const timeContext = new Date();
        const d1 = SnapshotManager.getDate('id1', timeContext);
        const d2 = SnapshotManager.getDate('id1', timeContext);
        expect(d2.getSeconds()).to.be.greaterThan(d1.getSeconds());
    });
});