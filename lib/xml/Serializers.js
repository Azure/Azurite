const BbPromise = require('bluebird'),
    xml2js = require('xml2js'),
    SignedIdentifiers = require('./../model/SignedIdentifierXmlModel'),
    parseStringAsync = BbPromise.promisify(new xml2js.Parser({ explicitArray: true }).parseString);


/**
 * body needs is expecrted to be formatted as utf-8
 */
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