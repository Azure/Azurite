'use strict';

const crypto = require('crypto');

/**
 * Not all allowed delimiters for blob names are valid file names. We thus replace those that are invalid with the valid 
 * delimiter @ on disk. Note that in our in-memory database and thus for the external interface we still 
 * use the originally chosen delimiter.
 */
exports.escapeBlobDelimiter = (blobPath) => {
    if (process.platform === 'win32') {
        const pathWithoutLetter = blobPath.substr(2);
        if (pathWithoutLetter === '') {
            return blobPath;
        }
        return (blobPath.substr(0, 2) + pathWithoutLetter.replace(/(::|:|\/|\||\/\/)/g, '@'));
        // LINUX / OS X
    } else {
        return blobPath.replace(/(::|:|\||\$)/g, '@');
    }
}

exports.computeEtag = (templateString) => {
    return crypto
        .createHash('sha1')
        .update(templateString, 'utf8')
        .digest('base64')
        .replace(/=+$/, '');
}