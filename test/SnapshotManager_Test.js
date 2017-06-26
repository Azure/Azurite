'use strict';

const chai = require('chai'),
    expect = chai.expect,
    SnapshotManager = require('./../lib/SnapshotTimeManager');

describe('SnapshotTimeManager', () => {
    it('should return a snapshot date that is at least one second greater than previous snapshot of same container-blob', () => {
        const d1 = SnapshotManager.getDate('container1', 'blob1');
        const d2 = SnapshotManager.getDate('container1', 'blob1');
        expect(d2.getSeconds()).to.be.greaterThan(d1.getSeconds());
    });
});