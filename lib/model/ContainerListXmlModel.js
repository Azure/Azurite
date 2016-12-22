'use strict';

/*
 * These classes are used as model for XML-Serialization in the "ListContainer" API.
*/
class ContainerList {
    constructor() {
        this.prefix = '';
        this.marker = '';
        this.maxResults = '';
        this.containers = {
            container: []
        }
        this.nextMarker;
    }
}

class Container {
    constructor(name) {
        this.name = name || '';
        this.properties = new Properties();
        this.metadata = {};
    }
}

class Properties {
    constructor() {
        this['Last-Modified'];
        this.ETag;
        this.LeaseStatus = 'unlocked';
        this.LeaseState = 'available';
        this.LeaseDuration = 'infinite';
    }
}

module.exports = {
    ContainerList: ContainerList,
    Container: Container
}