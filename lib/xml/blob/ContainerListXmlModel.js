'use strict';

/*
 * These classes are used as model for XML-Serialization in the "ListContainer" API.
*/
class ContainerList {
    constructor() {
        this.Prefix = '';
        this.Marker = '';
        this.MaxResults = '';
        this.Containers = {
            Container: []
        }
        this.NextMarker;
    }
}

class Container {
    constructor(name) {
        this.Name = name || '';
        this.Properties = new Properties();
        this.Metadata = {};
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

export default {
    ContainerList: ContainerList,
    Container: Container
};