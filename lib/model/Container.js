'use strict';

class Container {
    constructor(name, props, metaProps, optional) {
        this.name = name;
        this.httpProps = props || {};
        this.metaProps = metaProps || {};
        if (optional) {
            this.access = optional.access || 'private'
        }
    }
}

module.exports = Container;