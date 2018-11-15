/** @format */
'use strict';
const Keys = require("./../../core/Constants").Keys,
    crypto = require('crypto');

const AccountSASProps = ['accountName', 'permissions', 'ss', 'srt', 'start', 'expiry', 'ipAddressOrRange', 'protocols', 'version', ];
const BlobServiceSASProps = ['permissions', 'start', 'expiry', 'canonicalizedResource', 'id', 'ipAddressOrRange', 'protocols', 'version', 'rscc', 'rscd', 'rsce', 'rscl', 'rsct', ];
const QueueServiceSASProps = ['permissions', 'start', 'expiry', 'canonicalizedResource', 'id', 'ipAddressOrRange', 'protocols', 'version'];
const TableServiceSASProps = ['permissions', 'start', 'expiry', 'canonicalizedResource', 'id', 'ipAddressOrRange', 'protocols', 'version', 'startingPartitionKey', 'startingRowKey', 'endingPartitionKey', 'endingRowKey', ];

// Function expects access policy and SAS props array... this would be better with typescript
// see https://docs.microsoft.com/en-us/rest/api/storageservices/constructing-a-service-sas#constructing-the-signature-string
function generateSASSignature(sasProps, accessPolicy) {
    let str = "";
    for (const key in sasProps) {
        if (sasProps.hasOwnProperty(key)) {
            str += accessPolicy[sasProps[key]] === undefined ? `\n` : `${accessPolicy[sasProps[key]]}\n`;
        }
    }
    const sig = crypto
        .createHmac("sha256", Keys.DecodedAccessKey)
        .update(str, "utf8")
        .digest("base64");
    return sig;
}

module.exports = {
    generateSASSignature,
    AccountSASProps,
    BlobServiceSASProps,
    QueueServiceSASProps,
    TableServiceSASProps,
};