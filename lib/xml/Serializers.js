const BbPromise = require('bluebird'),
    xml2js = require('xml2js'),
    SignedIdentifiers = require('./SignedIdentifierXmlModel'),
    AError = require('./../core/AzuriteError'),
    parseStringAsync = BbPromise.promisify(new xml2js.Parser({ explicitArray: true }).parseString),
    parseStringAsyncNoArray = BbPromise.promisify(new xml2js.Parser({ explicitArray: false }).parseString),
    xml2jsAsync = BbPromise.promisify(require('xml2js').parseString);

exports.parseSignedIdentifiers = (body) => {
    body = body.toString('utf8');
    return parseStringAsync(body)
        .then((temp) => {
            if (temp === null) {
                return null;
            }
            const model = new SignedIdentifiers();
            if (temp.SignedIdentifiers !== "") {
                for (const si of temp.SignedIdentifiers.SignedIdentifier) {
                    model.addSignedIdentifier(si.Id[0], si.AccessPolicy[0].Start[0], si.AccessPolicy[0].Expiry[0], si.AccessPolicy[0].Permission[0]);
                }
            }
            return model;
        });
}

exports.deserializeBlockList = (body) => {
    const txt = body.toString('utf8');
    return xml2jsAsync(txt)
        .then((result) => {
            let blockIds = [];
            Object.keys(result.BlockList).forEach((type) => {
                result.BlockList[type].forEach((id) => {
                    blockIds.push({
                        type: type,
                        id: id
                    });
                });
            });
            return blockIds;
        })
        .catch((err) => {
            throw new AError('Invalid XML.', 400, 'One of the XML nodes specified in the request body is not supported.');
        });
}

exports.parseServiceProperties = (body) => {
    const xml = body.toString('utf8');
    return parseStringAsyncNoArray(xml)
    .then((result) => {
        return result;
    })
    .catch((err) => {
        throw new AError('Invalid XML.', 400, 'One of the XML nodes specified in the request body is not supported.');
    });
}