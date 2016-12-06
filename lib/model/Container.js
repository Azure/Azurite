class Container {
    constructor(name, props, optional) {
        this.name = name;
        this.props = props || {};
        if (optional) {
            this.access = optional.access || 'private'
        }
    }
}

module.exports = Container;