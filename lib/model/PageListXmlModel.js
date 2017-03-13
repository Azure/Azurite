'use strict';

const os = require('os');

class PageListModel {
    constructor() {
        this.items = [];
    }

    toString() {
        let out = '<PageList>' + os.EOL;
        for (let item of this.items) {
            out += (item instanceof PageRange) ? '<PageRange>' + os.EOL : '<ClearRange>' + os.EOL;
            out += `<Start>${item.start}</Start>` + os.EOL;
            out += `<End>${item.end}</End>` +os.EOL;
            out += (item instanceof PageRange) ? '</PageRange>' + os.EOL : '</ClearRange>' + os.EOL;
        }
        out += '</PageList>';
    }
}

class PageRange {
    constructor(startByte, endByte) {
        this.start = startByte;
        this.end = endByte;
    }
}

class ClearRange {
    constructor(startByte, endByte) {
        this.start = startByte;
        this.end = endByte;
    }
}

module.exports = {
    PageListModel: PageListModel,
    PageRange: PageRange,
    ClearRange: ClearRange
}