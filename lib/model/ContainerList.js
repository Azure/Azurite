'use strict';

/*
 * These classes are used as model for XML-Serialization in the "ListContainer" API.
*/
class ContainerList {
    constructor() {
        this.prefix = '';
        this.markers = '';
        this.maxResults = '';
        this.containers = {
            container: []
        }
        this.metadata = [];
        this.nextMarker;
    }
}

class Container {
    constructor() {
        this.name = '';
        this.properties = [];
    }
}

class Property {
    constructor() {
        this.lastModified;
        this.ETag;
        this.LeaseStatus;
        this.LeaseState;
        this.LeaseDuration;
    }
}

module.exports = {
    ContainerList: ContainerList,
    Container: Container, 
    Property: Property
}