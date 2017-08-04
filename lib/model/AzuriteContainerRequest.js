'use strict';

const EntityType = require('./../Constants').StorageEntityType,
    AzuriteRequest = require('./AzuriteRequest');

class AzuriteContainerRequest extends AzuriteRequest {
    constructor({
        containerName = '',
        httpHeaders = {},
        rawHeaders = [] }) {

        super(httpHeaders, rawHeaders, EntityType.Container);
        this.containerName = containerName;
    }
}

module.exports = AzuriteContainerRequest;