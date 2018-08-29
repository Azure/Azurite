import * as BbPromise from 'bluebird';
import xml2js from 'xml2js';
import SignedIdentifiers from './SignedIdentifierXmlModel';
import AError from './../core/AzuriteError';
import xml2js from 'xml2js';

const xml2jsAsync = BbPromise.promisify(xml2js.parseString);
const parseStringAsync = BbPromise.promisify(new xml2js.Parser({ explicitArray: true }).parseString), parseStringAsyncNoArray = BbPromise.promisify(new xml2js.Parser({ explicitArray: false }).parseString);

// see https://docs.microsoft.com/en-us/rest/api/storageservices/Set-Container-ACL?redirectedfrom=MSDN
export const parseSignedIdentifiers = (body) => {
    body = body.toString('utf8');
    return parseStringAsync(body)
        .then((temp) => {
            if (temp === null) {
                return null;
            }
            const model = new SignedIdentifiers();
            if (temp.SignedIdentifiers !== "") {
                for (const si of temp.SignedIdentifiers.SignedIdentifier) {
                    let start;
                    let expiry;
                    let permission;
                    // for case where expiry not defined initially just avoiding a PANIC
                    if(typeof si.AccessPolicy != 'undefined'){
                        if(typeof si.AccessPolicy.Start != 'undefined'){
                            start = si.AccessPolicy.Start[0];
                        }
                        else{
                            console.log(new Date().toISOString(), ' INFO ACCESS_POLICY_START_UNDEFINED \"', si , '\"');
                        }

                        if(typeof si.AccessPolicy.Expiry != 'undefined'){
                            expiry = si.AccessPolicy.Expiry[0];
                        }
                        else{
                            // if you have no expiry set on your SAS Key, you are doing something wrong
                            console.log(new Date().toISOString(), ' ERROR ACCESS_POLICY_EXPIRY_UNDEFINED \"', si, '\"');
                            let MAX_TIMESTAMP = 8640000000000000;
                            expiry = new Date(MAX_TIMESTAMP).toISOString();
                        }

                        if(typeof si.AccessPolicy.Permission != 'undefined'){
                            expiry = si.AccessPolicy.Permission[0];
                        }
                        model.addSignedIdentifier(si.Id[0], start, expiry,permission);
                    }
                    else
                    {
                        // as Azurite is a tool to aid development, we should notify developers that a mistake has been made
                        console.log(new Date().toISOString(), ' ERROR ACCESS_POLICY_UNDEFINED \"', si,'\"');
                    }
                    
                }
            }
            return model;
        });
};

export const deserializeBlockList = (body) => {
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
};

export const parseServiceProperties = (body) => {
    const xml = body.toString('utf8');
    return parseStringAsyncNoArray(xml)
        .then((result) => {
            if (result.StorageServiceProperties.Cors !== undefined &&
                result.StorageServiceProperties.Cors.CorsRule !== undefined &&
                !(result.StorageServiceProperties.Cors.CorsRule instanceof Array)) {

                const rule = result.StorageServiceProperties.Cors.CorsRule;
                result.StorageServiceProperties.Cors.CorsRule = [];
                result.StorageServiceProperties.Cors.CorsRule.push(rule);
            }
            return result;
        })
        .catch((err) => {
            throw new AError('Invalid XML.', 400, 'One of the XML nodes specified in the request body is not supported.');
        });
};